import fs from "node:fs/promises";
import path from "node:path";
import { STAGING_ROOT, resolveUnderRoot } from "../util/path.js";

/**
 * 検索結果に対するフォルダ操作。
 * 全て STAGING_ROOT 配下で完結させ、外には絶対に出ない。
 */

export async function moveFolder(fromPath: string, toPath: string) {
  const src = resolveUnderRoot(STAGING_ROOT, fromPath);
  const dst = resolveUnderRoot(STAGING_ROOT, toPath);
  if (!src || !dst) throw new Error("PATH_OUT_OF_ROOT");
  await fs.mkdir(path.dirname(dst), { recursive: true });
  await fs.rename(src, dst);
  return { ok: true, from: src, to: dst };
}

/**
 * タイトル削除: フォルダごと削除。
 * 安全のため、デフォルトでは物理削除はせず ".__trash" にリネームする。
 * 完全削除したい場合は permanent=true。
 */
export async function deleteTitleFolder(folderPath: string, permanent = false) {
  const abs = resolveUnderRoot(STAGING_ROOT, folderPath);
  if (!abs) throw new Error("PATH_OUT_OF_ROOT");
  if (permanent) {
    await fs.rm(abs, { recursive: true, force: true });
    return { ok: true, deleted: abs, permanent: true };
  }
  const trashRoot = path.join(path.resolve(STAGING_ROOT), ".__trash");
  await fs.mkdir(trashRoot, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dst = path.join(trashRoot, `${path.basename(abs)}__${stamp}`);
  await fs.rename(abs, dst);
  return { ok: true, deleted: abs, movedTo: dst, permanent: false };
}

/**
 * タイトルフォルダを新規作成。
 * parentPath は STAGING_ROOT 配下の作品階層ルート想定。
 */
export async function createTitleFolder(parentPath: string, name: string) {
  if (!name || /[\\/]/.test(name)) throw new Error("INVALID_NAME");
  const parent = resolveUnderRoot(STAGING_ROOT, parentPath);
  if (!parent) throw new Error("PATH_OUT_OF_ROOT");
  const created = path.join(parent, name);
  await fs.mkdir(created, { recursive: true });
  return { ok: true, created };
}
