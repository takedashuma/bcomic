import type { GraphQLContext } from "../context.js";
import { requireUser } from "../context.js";
import {
  setAuthCookie,
  clearAuthCookie,
  signToken,
  verifyAndMaybeMigratePassword,
  hashPassword,
} from "../auth.js";
import { resolveVolumeFolder, listVolumePages } from "../util/path.js";
import { GraphQLScalarType, Kind } from "graphql";

const DateTimeScalar = new GraphQLScalarType({
  name: "DateTime",
  description: "ISO 8601 datetime string",
  serialize(value) {
    if (value instanceof Date) return value.toISOString();
    if (typeof value === "string") return new Date(value).toISOString();
    return null;
  },
  parseValue(value) {
    return typeof value === "string" ? new Date(value) : null;
  },
  parseLiteral(ast) {
    if (ast.kind === Kind.STRING) return new Date(ast.value);
    return null;
  },
});

function folderId(authorEn: string, titleEn: string): string {
  return Buffer.from(`${authorEn}${titleEn}`).toString("base64url");
}
function decodeFolderId(id: string): { authorEn: string; titleEn: string } | null {
  try {
    const s = Buffer.from(id, "base64url").toString("utf8");
    const [a, t] = s.split("");
    if (!a || !t) return null;
    return { authorEn: a, titleEn: t };
  } catch {
    return null;
  }
}

/**
 * 作品集約クエリ。tb_bok を (authorJa, titleJa) で GROUP BY し、
 * 検索・ソート・ページネーション・お気入フラグを付与する。
 *
 * 参照SQL:
 *   SELECT bok_vch6, bok_vch7,
 *          MAX(bok_txt1), MAX(bok_mid) AS max_bok_mid,
 *          MAX(bok_vch8) AS max_bok_vch8, COUNT(bok_vch8) AS cnt_bok_vch8
 *   FROM tb_bok
 *   WHERE bok_dlday IS NULL AND bok_vch9 = 'comic'
 *   GROUP BY bok_vch6, bok_vch7
 *   ORDER BY max_bok_mid DESC
 */
async function listFolders(
  ctx: GraphQLContext,
  args: {
    q?: string | null;
    page?: number | null;
    pageSize?: number | null;
    onlyFavorites?: boolean;
  }
) {
  const userId = requireUser(ctx);
  const page = Math.max(args.page ?? 1, 1);
  const pageSize = Math.min(Math.max(args.pageSize ?? 24, 1), 100);
  const skip = (page - 1) * pageSize;
  const q = args.q?.trim() || null;

  // お気入のみフィルタ（日本語名でキー化）
  let favKeys: { authorJa: string; titleJa: string }[] | null = null;
  if (args.onlyFavorites) {
    const favs = await ctx.prisma.bookmark.findMany({
      where: { userId, deletedAt: null },
      select: { authorJa: true, titleJa: true },
    });
    favKeys = favs
      .filter((f) => f.authorJa && f.titleJa)
      .map((f) => ({ authorJa: f.authorJa!, titleJa: f.titleJa! }));
    if (favKeys.length === 0) {
      return { items: [], total: 0, page, pageSize };
    }
  }

  // where 条件構築: bok_dlday IS NULL AND bok_vch9 = 'comic'
  const where: any = { deletedAt: null, vch9: "comic" };
  if (q) {
    where.OR = [
      { authorJa: { contains: q } },
      { titleJa: { contains: q } },
      { authorEn: { contains: q } },
      { titleEn: { contains: q } },
    ];
  }
  if (favKeys) {
    where.AND = [
      {
        OR: favKeys.map((k) => ({ authorJa: k.authorJa, titleJa: k.titleJa })),
      },
    ];
  }

  // GROUP BY bok_vch6, bok_vch7 ORDER BY MAX(bok_mid) DESC
  const groups = await ctx.prisma.volume.groupBy({
    by: ["authorJa", "titleJa"],
    where,
    _max: { id: true, updatedAt: true },
    _count: { _all: true },
    orderBy: { _max: { id: "desc" } },
    skip,
    take: pageSize,
  });

  // 全件総数（ページネーション表示用）
  const totalAgg = await ctx.prisma.volume.groupBy({
    by: ["authorJa", "titleJa"],
    where,
    _count: { _all: true },
  });
  const total = totalAgg.length;

  // 各グループの最新巻と英字名（URL用代表値）を取得
  const items = await Promise.all(
    groups.map(async (g) => {
      if (!g.authorJa || !g.titleJa) return null;
      // 最新巻 = 同じ作品の中で bok_mid が最大の巻
      const latest = await ctx.prisma.volume.findFirst({
        where: { authorJa: g.authorJa, titleJa: g.titleJa, deletedAt: null, vch9: "comic" },
        orderBy: { id: "desc" },
      });
      if (!latest) return null;
      const isFav = await ctx.prisma.bookmark.findFirst({
        where: { userId, authorJa: g.authorJa, titleJa: g.titleJa, deletedAt: null },
        select: { id: true },
      });
      return {
        id: folderId(latest.authorEn ?? "", latest.titleEn ?? ""),
        topFolder: latest.topFolder,
        // URL用は英字（最新巻の英字を代表値として採用）
        authorEn: latest.authorEn,
        titleEn: latest.titleEn,
        authorJa: g.authorJa,
        titleJa: g.titleJa,
        volumeCount: g._count._all,
        latestVolume: latest,
        latestUpdatedAt: g._max.updatedAt,
        isFavorite: !!isFav,
      };
    })
  );

  return {
    items: items.filter((x): x is NonNullable<typeof x> => x !== null),
    total,
    page,
    pageSize,
  };
}

export const resolvers: any = {
  DateTime: DateTimeScalar,

  ComicFolder: {
    /**
     * 詳細ページ用: 同じ作品（日本語キー）の全巻を no 昇順で返す
     */
    async volumes(parent: any, _: any, ctx: GraphQLContext) {
      return ctx.prisma.volume.findMany({
        where: {
          authorJa: parent.authorJa,
          titleJa: parent.titleJa,
          deletedAt: null,
          vch9: "comic",
        },
        orderBy: { no: "asc" },
      });
    },
  },

  Volume: {
    async pageCount(parent: any) {
      const abs = resolveVolumeFolder(parent.folderPath);
      if (!abs) return 0;
      const pages = await listVolumePages(abs);
      return pages.length;
    },
    async progress(parent: any, _: any, ctx: GraphQLContext) {
      if (!ctx.userId) return null;
      const p = await ctx.prisma.readingProgress.findUnique({
        where: { uq_red_user_volume: { userId: ctx.userId, volumeId: parent.id } },
      });
      return p ? { lastPage: p.lastPage, updatedAt: p.updatedAt } : null;
    },
  },

  Query: {
    async me(_: any, __: any, ctx: GraphQLContext) {
      if (!ctx.userId) return null;
      const u = await ctx.prisma.user.findUnique({ where: { id: ctx.userId } });
      if (!u) return null;
      return { id: u.id, email: u.email, nickname: u.nickname };
    },

    comicFolders(_: any, args: any, ctx: GraphQLContext) {
      return listFolders(ctx, { ...args, onlyFavorites: false });
    },

    favorites(_: any, args: any, ctx: GraphQLContext) {
      return listFolders(ctx, { ...args, onlyFavorites: true });
    },

    async comicFolder(_: any, args: { authorEn: string; titleEn: string }, ctx: GraphQLContext) {
      const userId = requireUser(ctx);
      // URLは英字だが、グルーピングは日本語名で行う仕様。
      // まず英字でいずれか1巻を引いて日本語名を解決し、そこから作品全体を取得。
      const ref = await ctx.prisma.volume.findFirst({
        where: {
          authorEn: args.authorEn,
          titleEn: args.titleEn,
          deletedAt: null,
          vch9: "comic",
        },
        orderBy: { id: "desc" },
      });
      if (!ref || !ref.authorJa || !ref.titleJa) return null;
      const latest = await ctx.prisma.volume.findFirst({
        where: { authorJa: ref.authorJa, titleJa: ref.titleJa, deletedAt: null, vch9: "comic" },
        orderBy: { id: "desc" },
      });
      const cnt = await ctx.prisma.volume.count({
        where: { authorJa: ref.authorJa, titleJa: ref.titleJa, deletedAt: null, vch9: "comic" },
      });
      const isFav = await ctx.prisma.bookmark.findFirst({
        where: { userId, authorJa: ref.authorJa, titleJa: ref.titleJa, deletedAt: null },
        select: { id: true },
      });
      return {
        id: folderId(latest?.authorEn ?? args.authorEn, latest?.titleEn ?? args.titleEn),
        topFolder: ref.topFolder,
        authorEn: latest?.authorEn ?? args.authorEn,
        titleEn: latest?.titleEn ?? args.titleEn,
        authorJa: ref.authorJa,
        titleJa: ref.titleJa,
        volumeCount: cnt,
        latestVolume: latest,
        latestUpdatedAt: latest?.updatedAt ?? ref.updatedAt,
        isFavorite: !!isFav,
      };
    },

    async volume(_: any, args: { id: number }, ctx: GraphQLContext) {
      requireUser(ctx);
      return ctx.prisma.volume.findUnique({ where: { id: args.id } });
    },
  },

  Mutation: {
    async login(_: any, args: { email: string; password: string }, ctx: GraphQLContext) {
      const user = await ctx.prisma.user.findFirst({
        where: { email: args.email, deletedAt: null },
      });
      if (!user) throw new Error("INVALID_CREDENTIALS");
      const ok = await verifyAndMaybeMigratePassword(user.password, args.password, async (h) => {
        await ctx.prisma.user.update({ where: { id: user.id }, data: { password: h } });
      });
      if (!ok) throw new Error("INVALID_CREDENTIALS");
      await ctx.prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });
      const token = signToken({ uid: user.id, email: user.email });
      setAuthCookie(ctx.res, token);
      return { id: user.id, email: user.email, nickname: user.nickname };
    },

    async logout(_: any, __: any, ctx: GraphQLContext) {
      clearAuthCookie(ctx.res);
      return true;
    },

    async changePassword(
      _: any,
      args: { oldPassword: string; newPassword: string },
      ctx: GraphQLContext
    ) {
      const userId = requireUser(ctx);
      const user = await ctx.prisma.user.findUnique({ where: { id: userId } });
      if (!user) throw new Error("UNAUTHENTICATED");
      const ok = await verifyAndMaybeMigratePassword(user.password, args.oldPassword, async (h) => {
        await ctx.prisma.user.update({ where: { id: user.id }, data: { password: h } });
      });
      if (!ok) throw new Error("INVALID_OLD_PASSWORD");
      if (args.newPassword.length < 6) throw new Error("PASSWORD_TOO_SHORT");
      const h = await hashPassword(args.newPassword);
      await ctx.prisma.user.update({
        where: { id: userId },
        data: { password: h, updatedAt: new Date() },
      });
      return true;
    },

    async toggleFavorite(
      _: any,
      args: { authorEn: string; titleEn: string },
      ctx: GraphQLContext
    ) {
      const userId = requireUser(ctx);
      // 日本語名を tb_bok から拾う（作品の同定は日本語名で行う方針）
      const ref = await ctx.prisma.volume.findFirst({
        where: {
          authorEn: args.authorEn,
          titleEn: args.titleEn,
          deletedAt: null,
          vch9: "comic",
        },
      });
      if (!ref || !ref.authorJa || !ref.titleJa) {
        throw new Error("FOLDER_NOT_FOUND");
      }
      const existing = await ctx.prisma.bookmark.findFirst({
        where: {
          userId,
          authorJa: ref.authorJa,
          titleJa: ref.titleJa,
          deletedAt: null,
        },
      });
      if (existing) {
        // 論理削除（既存仕様に合わせる）
        await ctx.prisma.bookmark.update({
          where: { id: existing.id },
          data: { deletedAt: new Date() },
        });
        return false;
      }
      // tb_bkm は PK 自動採番ではないため MAX+1
      const max = await ctx.prisma.bookmark.aggregate({ _max: { id: true } });
      const nextId = (max._max.id ?? 0) + 1;
      await ctx.prisma.bookmark.create({
        data: {
          id: nextId,
          userId,
          authorEn: args.authorEn,
          titleEn: args.titleEn,
          authorJa: ref?.authorJa ?? null,
          titleJa: ref?.titleJa ?? null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
      return true;
    },

    async saveProgress(_: any, args: { volumeId: number; page: number }, ctx: GraphQLContext) {
      const userId = requireUser(ctx);
      const page = Math.max(0, args.page | 0);
      await ctx.prisma.readingProgress.upsert({
        where: { uq_red_user_volume: { userId, volumeId: args.volumeId } },
        create: { userId, volumeId: args.volumeId, lastPage: page },
        update: { lastPage: page },
      });
      return true;
    },
  },
};

export { folderId, decodeFolderId };
