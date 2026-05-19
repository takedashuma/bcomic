import type { AdminContext } from "../context.js";
import { requireAdmin } from "../context.js";
import {
  setAuthCookie,
  clearAuthCookie,
  signToken,
  verifyAndMaybeMigratePassword,
  hashPassword,
} from "../auth.js";
import { GraphQLScalarType, Kind } from "graphql";
import { searchMangaKingdom } from "../jobs/searchMangaKingdom.js";
import { crawl13dl, crawl13dlList } from "../jobs/crawl13dl.js";
import { makeRegistDir } from "../jobs/registDir.js";
import { compareUnregist } from "../jobs/compareUnregist.js";
import { listUnknownFolders } from "../jobs/listUnknownFolders.js";
import { exchangeDir, deleteDBandBook, renameRegistFolder } from "../jobs/compareOps.js";
import { startRegistUnregistAll } from "../jobs/registUnregist.js";
import { startExtractAllArchives } from "../jobs/extractAllArchives.js";
import { startMergeAllChapters } from "../jobs/mergeAllChapters.js";
import { getJob } from "../jobs/jobStore.js";
import { moveFolder, deleteTitleFolder, createTitleFolder } from "../jobs/folderOps.js";
import {
  moveToRegist,
  createRegistFolder,
  deleteVolumeDB,
  deleteVolumeDBAndDir,
} from "../jobs/comicRootOps.js";

const DateTimeScalar = new GraphQLScalarType({
  name: "DateTime",
  serialize(v) {
    if (v instanceof Date) return v.toISOString();
    if (typeof v === "string") return new Date(v).toISOString();
    return null;
  },
  parseValue(v) {
    return typeof v === "string" ? new Date(v) : null;
  },
  parseLiteral(ast) {
    if (ast.kind === Kind.STRING) return new Date(ast.value);
    return null;
  },
});

export const resolvers: any = {
  DateTime: DateTimeScalar,

  Query: {
    async me(_: any, __: any, ctx: AdminContext) {
      if (!ctx.adminId) return null;
      const a = await ctx.prisma.admin.findUnique({ where: { id: ctx.adminId } });
      if (!a) return null;
      return { id: a.id, name: a.name, lastLoginAt: a.lastLoginAt };
    },

    async searchComics(_: any, args: any, ctx: AdminContext) {
      requireAdmin(ctx);
      const q = (args.q as string).trim();
      const page = Math.max(args.page ?? 1, 1);
      const pageSize = Math.min(Math.max(args.pageSize ?? 50, 1), 200);
      const skip = (page - 1) * pageSize;
      if (!q) return [];
      return ctx.prisma.volume.findMany({
        where: {
          deletedAt: null,
          OR: [
            { authorJa: { contains: q } },
            { titleJa: { contains: q } },
            { authorEn: { contains: q } },
            { titleEn: { contains: q } },
            { folderPath: { contains: q } },
          ],
        },
        orderBy: { id: "desc" },
        skip,
        take: pageSize,
      });
    },

    async searchUnknown(_: any, args: any, ctx: AdminContext) {
      requireAdmin(ctx);
      const page = Math.max(args.page ?? 1, 1);
      const pageSize = Math.min(Math.max(args.pageSize ?? 50, 1), 200);
      const skip = (page - 1) * pageSize;
      const q = (args.q as string | null)?.trim() || null;

      // "未識別" の判定: titleJa or authorJa が空、または vch9 が unknown
      const where: any = {
        deletedAt: null,
        OR: [
          { titleJa: null },
          { titleJa: "" },
          { authorJa: null },
          { authorJa: "" },
          { vch9: "unknown" },
        ],
      };
      if (q) {
        where.AND = [
          {
            OR: [
              { titleJa: { contains: q } },
              { titleEn: { contains: q } },
              { folderPath: { contains: q } },
            ],
          },
        ];
      }
      const items = await ctx.prisma.volume.findMany({
        where,
        orderBy: { id: "desc" },
        skip,
        take: pageSize,
        select: { id: true, folderPath: true, authorJa: true, titleJa: true },
      });
      const total = await ctx.prisma.volume.count({ where });
      return { items, total, page, pageSize };
    },

    async compareNormal(_: any, args: any, ctx: AdminContext) {
      requireAdmin(ctx);
      return doCompare(ctx, args.folderPath, "comic");
    },

    async compareEro(_: any, args: any, ctx: AdminContext) {
      requireAdmin(ctx);
      return doCompare(ctx, args.folderPath, "ercomic");
    },

    async jobStatus(_: any, args: { id: string }, ctx: AdminContext) {
      requireAdmin(ctx);
      return getJob(args.id);
    },

    async compareUnregist(_: any, __: any, ctx: AdminContext) {
      requireAdmin(ctx);
      return compareUnregist();
    },

    async listUnknownFolders(_: any, __: any, ctx: AdminContext) {
      requireAdmin(ctx);
      return listUnknownFolders();
    },
  },

  Mutation: {
    async adminLogin(_: any, args: { name: string; password: string }, ctx: AdminContext) {
      const admin = await ctx.prisma.admin.findFirst({
        where: { name: args.name, deletedAt: null },
      });
      if (!admin) throw new Error("INVALID_CREDENTIALS");
      const ok = await verifyAndMaybeMigratePassword(admin.password, args.password, async (h) => {
        await ctx.prisma.admin.update({ where: { id: admin.id }, data: { password: h } });
      });
      if (!ok) throw new Error("INVALID_CREDENTIALS");
      await ctx.prisma.admin.update({
        where: { id: admin.id },
        data: { lastLoginAt: new Date() },
      });
      const token = signToken({ adminId: admin.id, name: admin.name });
      setAuthCookie(ctx.res, token);
      return { id: admin.id, name: admin.name, lastLoginAt: new Date() };
    },

    async adminLogout(_: any, __: any, ctx: AdminContext) {
      clearAuthCookie(ctx.res);
      return true;
    },

    async adminChangePassword(_: any, args: any, ctx: AdminContext) {
      const adminId = requireAdmin(ctx);
      const admin = await ctx.prisma.admin.findUnique({ where: { id: adminId } });
      if (!admin) throw new Error("UNAUTHENTICATED");
      const ok = await verifyAndMaybeMigratePassword(admin.password, args.oldPassword, async (h) => {
        await ctx.prisma.admin.update({ where: { id: admin.id }, data: { password: h } });
      });
      if (!ok) throw new Error("INVALID_OLD_PASSWORD");
      if ((args.newPassword as string).length < 6) throw new Error("PASSWORD_TOO_SHORT");
      const h = await hashPassword(args.newPassword);
      await ctx.prisma.admin.update({
        where: { id: adminId },
        data: { password: h, updatedAt: new Date() },
      });
      return true;
    },

    async startExtractAllArchives(_: any, __: any, ctx: AdminContext) {
      requireAdmin(ctx);
      const dir = process.env.EXTRACT_ARCHIVE_DIR;
      const unzipDest = process.env.UNZIP_DEST_DIR;
      const archiveDone = process.env.ARCHIVE_DONE_DIR;
      if (!dir) throw new Error("EXTRACT_ARCHIVE_DIR が設定されていません");
      if (!unzipDest) throw new Error("UNZIP_DEST_DIR が設定されていません");
      if (!archiveDone) throw new Error("ARCHIVE_DONE_DIR が設定されていません");
      return startExtractAllArchives({
        sourceDir: dir,
        kindLabel: "rar/zip 解凍",
        unzipDestDir: unzipDest,
        archiveDoneDir: archiveDone,
      });
    },

    async startExtractAllErArchives(_: any, __: any, ctx: AdminContext) {
      requireAdmin(ctx);
      const dir = process.env.EXTRACT_ER_ARCHIVE_DIR || process.env.EXTRACT_ARCHIVE_DIR;
      const unzipDest = process.env.UNZIP_DEST_DIR_ER || process.env.UNZIP_DEST_DIR;
      const archiveDone = process.env.ARCHIVE_DONE_DIR_ER || process.env.ARCHIVE_DONE_DIR;
      if (!dir) throw new Error("EXTRACT_ER_ARCHIVE_DIR が設定されていません");
      if (!unzipDest) throw new Error("UNZIP_DEST_DIR_ER / UNZIP_DEST_DIR が設定されていません");
      if (!archiveDone) throw new Error("ARCHIVE_DONE_DIR_ER / ARCHIVE_DONE_DIR が設定されていません");
      return startExtractAllArchives({
        sourceDir: dir,
        kindLabel: "ERComic 解凍",
        unzipDestDir: unzipDest,
        archiveDoneDir: archiveDone,
      });
    },

    async startMergeAllChapters(_: any, __: any, ctx: AdminContext) {
      requireAdmin(ctx);
      const dir = process.env.MERGE_CHAPTER_DIR;
      if (!dir) throw new Error("MERGE_CHAPTER_DIR が設定されていません");
      return startMergeAllChapters({ sourceDir: dir });
    },

    async moveFolder(_: any, args: any, ctx: AdminContext) {
      requireAdmin(ctx);
      try {
        const r = await moveFolder(args.fromPath, args.toPath);
        return { ok: true, message: `移動完了: ${r.from} → ${r.to}`, path: r.to };
      } catch (e: any) {
        return { ok: false, message: e.message, path: null };
      }
    },
    async deleteTitleFolder(_: any, args: any, ctx: AdminContext) {
      requireAdmin(ctx);
      try {
        const r = await deleteTitleFolder(args.folderPath, !!args.permanent);
        return {
          ok: true,
          message: r.permanent
            ? `物理削除: ${r.deleted}`
            : `ゴミ箱に移動: ${r.movedTo}`,
          path: r.permanent ? null : (r as any).movedTo,
        };
      } catch (e: any) {
        return { ok: false, message: e.message, path: null };
      }
    },
    async createTitleFolder(_: any, args: any, ctx: AdminContext) {
      requireAdmin(ctx);
      try {
        const r = await createTitleFolder(args.parentPath, args.name);
        return { ok: true, message: `作成: ${r.created}`, path: r.created };
      } catch (e: any) {
        return { ok: false, message: e.message, path: null };
      }
    },

    async searchFromMangaKingdom(_: any, args: any, ctx: AdminContext) {
      requireAdmin(ctx);
      return searchMangaKingdom(args.titleJa);
    },

    async registerNormalComic(_: any, args: any, ctx: AdminContext) {
      requireAdmin(ctx);
      return registerComic(ctx, args.input, "comic");
    },

    async registerEroComic(_: any, args: any, ctx: AdminContext) {
      requireAdmin(ctx);
      return registerComic(ctx, args.input, "ercomic");
    },

    async crawlPage(_: any, args: any, ctx: AdminContext) {
      requireAdmin(ctx);
      return crawl13dl(args.url);
    },

    async crawl13dlList(_: any, args: any, ctx: AdminContext) {
      requireAdmin(ctx);
      return crawl13dlList(
        args.categoryUrl,
        args.pageNum ?? 1,
        args.startIdx ?? 1,
        args.endIdx ?? 7
      );
    },

    async makeRegistDir(_: any, args: any, ctx: AdminContext) {
      requireAdmin(ctx);
      return makeRegistDir(args.dir);
    },

    async exchangeDir(_: any, args: { newDir: string }, ctx: AdminContext) {
      requireAdmin(ctx);
      return exchangeDir(args.newDir);
    },
    async deleteDBandBook(_: any, args: { bookPath: string }, ctx: AdminContext) {
      requireAdmin(ctx);
      return deleteDBandBook(args.bookPath);
    },
    async renameRegistFolder(
      _: any,
      args: { oldDir: string; newDir: string; inRegist?: boolean },
      ctx: AdminContext
    ) {
      requireAdmin(ctx);
      return renameRegistFolder(args.oldDir, args.newDir, args.inRegist ?? true);
    },
    async startRegistUnregistAll(_: any, __: any, ctx: AdminContext) {
      requireAdmin(ctx);
      return startRegistUnregistAll();
    },

    // ===== 検索結果アクション (旧admin_new準拠) =====
    async moveToRegist(_: any, args: { folderPath: string }, ctx: AdminContext) {
      requireAdmin(ctx);
      return moveToRegist(args.folderPath);
    },
    async createRegistFolder(_: any, args: { folderPath: string }, ctx: AdminContext) {
      requireAdmin(ctx);
      return createRegistFolder(args.folderPath);
    },
    async deleteVolumeDB(_: any, args: { id: number }, ctx: AdminContext) {
      requireAdmin(ctx);
      return deleteVolumeDB(args.id);
    },
    async deleteVolumeDBAndDir(
      _: any,
      args: { id: number; folderPath: string },
      ctx: AdminContext
    ) {
      requireAdmin(ctx);
      return deleteVolumeDBAndDir(args.id, args.folderPath);
    },
  },
};

async function doCompare(ctx: AdminContext, folderPath: string, kind: string) {
  // folderPath からファイル名規約 "[AuthorEn;著者] TitleEn;タイトル/NN" をパース
  const parsed = parseFolderPath(folderPath);
  const existing = parsed
    ? await ctx.prisma.volume.findFirst({
        where: {
          authorEn: parsed.authorEn,
          titleEn: parsed.titleEn,
          no: parsed.no,
          deletedAt: null,
        },
      })
    : null;
  const diffs: string[] = [];
  if (!parsed) diffs.push("フォルダ名のパースに失敗");
  if (existing && parsed) {
    if (existing.authorJa !== parsed.authorJa) diffs.push(`authorJa: "${existing.authorJa}" → "${parsed.authorJa}"`);
    if (existing.titleJa !== parsed.titleJa) diffs.push(`titleJa: "${existing.titleJa}" → "${parsed.titleJa}"`);
    if (existing.vch9 !== kind) diffs.push(`kind: "${existing.vch9}" → "${kind}"`);
  }
  return {
    folderPath,
    existingVolume: existing,
    parsedAuthorEn: parsed?.authorEn ?? null,
    parsedTitleEn: parsed?.titleEn ?? null,
    parsedAuthorJa: parsed?.authorJa ?? null,
    parsedTitleJa: parsed?.titleJa ?? null,
    parsedNo: parsed?.no ?? null,
    differences: diffs,
    canRegister: !!parsed && !existing,
  };
}

async function registerComic(ctx: AdminContext, input: any, kind: string) {
  const adminId = requireAdmin(ctx);
  // bok_mid は手動採番（既存 tb_bok 仕様に合わせる）
  const max = await ctx.prisma.volume.aggregate({ _max: { id: true } });
  const nextId = (max._max.id ?? 0) + 1;
  const topFolder = (input.authorEn?.[0] || "0").toUpperCase();
  // bok_txt1 (folderPath) は COMIC_ROOT 相対パスで保存（既存仕様）
  const created = await ctx.prisma.volume.create({
    data: {
      id: nextId,
      topFolder,
      authorJa1: `${input.authorEn};${input.authorJa}`,
      authorEn: input.authorEn,
      titleEn: input.titleEn,
      no: input.no,
      authorJa: input.authorJa,
      titleJa: input.titleJa,
      noJa: input.no,
      vch9: kind,
      folderPath: input.folderPath,
      draft: "1",
      createdAt: new Date(),
      updatedAt: new Date(),
      inputUserId: adminId,
      updateUserId: adminId,
    },
  });
  return created;
}

/**
 * フォルダパス "/J/[AuthorEn;著者] TitleEn;タイトル/01" をパース
 * 既存PHP版の命名規則に従う
 */
export function parseFolderPath(folderPath: string): {
  topFolder: string;
  authorEn: string;
  authorJa: string;
  titleEn: string;
  titleJa: string;
  no: string;
} | null {
  // 例: /J/[JigokunoMisawa;地獄のミサワ] KakkoKawaiiSengen;カッコカワイイ宣言/01
  const m = /^\/?([0-9A-Z])\/\[([^;\]]+);([^\]]+)\]\s+([^;]+);([^/]+)\/(\d+)\/?$/.exec(folderPath);
  if (!m) return null;
  return {
    topFolder: m[1],
    authorEn: m[2],
    authorJa: m[3],
    titleEn: m[4],
    titleJa: m[5],
    no: m[6],
  };
}
