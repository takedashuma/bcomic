import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "../db.js";
import { COMIC_ROOT, resolveUnderRoot } from "../util/path.js";
import { runCmd } from "./runtime.js";

/**
 * 検索結果（COMIC_ROOT 内のタイトル）に対する操作群。
 *
 * - moveToRegist            : COMIC_ROOT/<rel> → REGIST_DIR/<rel> へフォルダ移動 (cross-device safe)
 * - createRegistFolder      : REGIST_DIR/<rel> を空フォルダで mkdir -p (旧 makeFolder.php)
 * - deleteVolumeDB          : tb_bok の該当行のみ削除 (FS は触らない)
 * - deleteVolumeDBAndDir    : tb_bok の該当行を削除し、COMIC_ROOT/<rel> も rm -rf
 */

function registRoot(): string | null {
  const r = process.env.REGIST_DIR;
  return r ? path.resolve(r) : null;
}

/**
 * src ディレクトリ配下のファイル数を再帰カウント (NFC/NFD どちらでも到達)
 */
async function countFilesRecursive(p: string): Promise<number> {
  const variants = Array.from(new Set([p, p.normalize("NFC"), p.normalize("NFD")]));
  for (const v of variants) {
    try {
      const st = await fs.stat(v);
      if (!st.isDirectory()) return 1;
      const entries = await fs.readdir(v);
      let n = 0;
      for (const e of entries) {
        n += await countFilesRecursive(path.join(v, e));
      }
      return n;
    } catch {
      /* try next variant */
    }
  }
  return 0;
}

/**
 * 中身ごとコピー (cp -a)。
 * 日本語 NFC/NFD ミスマッチが起きやすい JS の fs.readdir/copyFile より
 * シェルの cp -a の方が堅牢 (busybox/GNU coreutils 共通動作)。
 *
 * cp -a で src ディレクトリ自身を dst の中に作るのではなく、src の中身を dst にコピーするため
 *   "cp -a <src>/. <dst>"  という形式を使う (末尾の /. が肝)。
 * dst は事前に mkdir -p 済みである必要がある。
 */
async function copyDirContents(src: string, dst: string): Promise<{ code: number; logs: string[] }> {
  return runCmd("cp", ["-a", src + "/.", dst]);
}

/**
 * COMIC_ROOT/<folderPath> を REGIST_DIR/<folderPath> へ移動し、
 * かつ tb_bok の該当タイトル配下の全巻レコードも削除する。
 *
 *   ex) folderPath="/H/[HaraYasuhisa;原泰久] Kingdom;キングダム"
 *       → mv /comics/H/[HaraYasuhisa;原泰久] Kingdom;キングダム
 *            → /regist/H/[HaraYasuhisa;原泰久] Kingdom;キングダム
 *       → tb_bok の bok_txt1 が folderPath で始まる行を全部 deleteMany
 *
 * mount を跨ぐ場合 rename が EXDEV になるので、その時は copy + rm の保険。
 */
export async function moveToRegist(folderPath: string) {
  const regist = registRoot();
  if (!regist) {
    return { ok: false, message: "REGIST_DIR が設定されていません", path: null };
  }
  const src = resolveUnderRoot(COMIC_ROOT, folderPath);
  const dst = resolveUnderRoot(regist, folderPath);
  if (!src || !dst) {
    return { ok: false, message: "パスが root の外を指しています", path: null };
  }
  try {
    await fs.access(src);
  } catch {
    return { ok: false, message: `元フォルダが見つかりません: ${src}`, path: null };
  }
  await fs.mkdir(path.dirname(dst), { recursive: true });
  let movedMsg = "";
  const srcFileCount = await countFilesRecursive(src);
  try {
    // 同一ファイルシステム内なら rename が最速
    await fs.rename(src, dst);
    movedMsg = `移動(rename): ${src} → ${dst} (${srcFileCount} files)`;
  } catch (e: any) {
    if (e?.code === "EXDEV") {
      // cross-device → cp -a + rm -rf
      // (Docker bind mount 同士は別 mount 扱いになるためここに来る)
      await fs.mkdir(dst, { recursive: true });
      const cpRes = await copyDirContents(src, dst);
      if (cpRes.code !== 0) {
        return {
          ok: false,
          message:
            `cp -a 失敗 (code=${cpRes.code}): ` +
            cpRes.logs.slice(-10).join(" | "),
          path: null,
        };
      }
      // コピーが完全に終わったことを確認 (ファイル数比較)
      const dstFileCount = await countFilesRecursive(dst);
      if (dstFileCount < srcFileCount) {
        return {
          ok: false,
          message:
            `コピー不完全: src=${srcFileCount}件 dst=${dstFileCount}件 ` +
            `(src は削除せず残しています: ${src})`,
          path: null,
        };
      }
      // src を削除
      await fs.rm(src, { recursive: true, force: true });
      movedMsg = `移動(cp -a): ${src} → ${dst} (${dstFileCount}/${srcFileCount} files)`;
    } else {
      return { ok: false, message: `移動失敗: ${e.message}`, path: null };
    }
  }

  // tb_bok から該当タイトル配下の全巻レコードを削除
  //   bok_txt1 が "<folderPath>" 自身 または "<folderPath>/..." で始まる行を対象
  const norm = "/" + folderPath.replace(/^\/+/, "").replace(/\/+$/, "");
  let dbMsg = "";
  try {
    const r = await prisma.volume.deleteMany({
      where: {
        OR: [
          { folderPath: norm },
          { folderPath: { startsWith: norm + "/" } },
        ],
      },
    });
    dbMsg = ` / tb_bok から ${r.count} 件削除`;
  } catch (e: any) {
    dbMsg = ` / [warn] tb_bok 削除失敗: ${e.message}`;
  }

  return { ok: true, message: movedMsg + dbMsg, path: dst };
}

/**
 * 旧 PHP makeFolder.php の代替。
 *   REGIST_DIR/<folderPath> を空フォルダで mkdir -p。
 *   呼び元: 検索結果行から「タイトルフォルダ作成」ボタン。
 */
export async function createRegistFolder(folderPath: string) {
  const regist = registRoot();
  if (!regist) {
    return { ok: false, message: "REGIST_DIR が設定されていません", path: null };
  }
  const dst = resolveUnderRoot(regist, folderPath);
  if (!dst) {
    return { ok: false, message: "パスが root の外を指しています", path: null };
  }
  try {
    await fs.mkdir(dst, { recursive: true });
    return { ok: true, message: `作成: ${dst}`, path: dst };
  } catch (e: any) {
    return { ok: false, message: `作成失敗: ${e.message}`, path: null };
  }
}

/**
 * tb_bok の該当 id の行のみ削除（FS は触らない）。
 */
export async function deleteVolumeDB(id: number) {
  try {
    const r = await prisma.volume.delete({ where: { id } });
    return { ok: true, message: `DB削除完了: id=${r.id}`, path: null };
  } catch (e: any) {
    return { ok: false, message: `DB削除失敗: ${e.message}`, path: null };
  }
}

/**
 * tb_bok の該当 id の行を削除 + COMIC_ROOT/<folderPath> を rm -rf。
 */
export async function deleteVolumeDBAndDir(id: number, folderPath: string) {
  const abs = resolveUnderRoot(COMIC_ROOT, folderPath);
  if (!abs) {
    return { ok: false, message: "パスが COMIC_ROOT の外を指しています", path: null };
  }
  // DB 削除
  let dbMsg = "";
  try {
    const r = await prisma.volume.delete({ where: { id } });
    dbMsg = `DB削除 id=${r.id}`;
  } catch (e: any) {
    dbMsg = `DB削除失敗: ${e.message}`;
  }
  // FS 削除（存在しなければスキップ）
  let fsMsg = "";
  try {
    await fs.access(abs);
    await fs.rm(abs, { recursive: true, force: true });
    fsMsg = `FS削除: ${abs}`;
  } catch {
    fsMsg = "FSは存在せず";
  }
  return { ok: true, message: `${dbMsg} / ${fsMsg}`, path: abs };
}
