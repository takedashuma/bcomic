import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "../db.js";
import { COMIC_ROOT, resolveUnderRoot } from "../util/path.js";

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

async function copyRecursive(src: string, dst: string) {
  const st = await fs.stat(src);
  if (st.isDirectory()) {
    await fs.mkdir(dst, { recursive: true });
    const entries = await fs.readdir(src);
    for (const e of entries) await copyRecursive(path.join(src, e), path.join(dst, e));
  } else {
    await fs.copyFile(src, dst);
  }
}

/**
 * COMIC_ROOT/<folderPath> を REGIST_DIR/<folderPath> へ移動。
 *   ex) folderPath="/H/[HaraYasuhisa;原泰久] Kingdom;キングダム"
 *       → mv /comics/H/[HaraYasuhisa;原泰久] Kingdom;キングダム
 *            → /regist/H/[HaraYasuhisa;原泰久] Kingdom;キングダム
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
  try {
    await fs.rename(src, dst);
    return { ok: true, message: `移動: ${src} → ${dst}`, path: dst };
  } catch (e: any) {
    if (e?.code === "EXDEV") {
      // cross-device → copy + rm
      await copyRecursive(src, dst);
      await fs.rm(src, { recursive: true, force: true });
      return { ok: true, message: `移動(copy): ${src} → ${dst}`, path: dst };
    }
    return { ok: false, message: `移動失敗: ${e.message}`, path: null };
  }
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
