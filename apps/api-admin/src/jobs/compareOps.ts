import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "../db.js";

/**
 * 旧 PHP /admin_new/exchangeDir.php の代替。
 *   REGIST_DIR/<newDir> を COMIC_ROOT/<newDir> へ「入換」する。
 *     1. COMIC_ROOT/<newDir> を削除（存在すれば）
 *     2. REGIST_DIR/<newDir> を COMIC_ROOT/<newDir> に移動 (copy + rm)
 *     3. REGIST_DIR/<newDir> を削除
 */
export async function exchangeDir(newDir: string): Promise<{
  ok: boolean;
  message: string;
  path: string | null;
}> {
  const unregist = process.env.REGIST_DIR;
  const books = process.env.COMIC_ROOT;
  if (!unregist || !books) {
    return { ok: false, message: "REGIST_DIR / COMIC_ROOT が設定されていません", path: null };
  }
  const src = path.join(unregist, newDir.replace(/^\/+/, ""));
  const dst = path.join(books, newDir.replace(/^\/+/, ""));
  if (!src.startsWith(path.resolve(unregist)) || !dst.startsWith(path.resolve(books))) {
    return { ok: false, message: "パスが root の外を指しています", path: null };
  }

  try {
    // 1) COMIC_ROOT 側を削除
    await fs.rm(dst, { recursive: true, force: true });
    // 2) cp -R src → dst （rename だと cross-device で失敗するので copy ベース）
    await fs.mkdir(path.dirname(dst), { recursive: true });
    await copyRecursive(src, dst);
    // 3) UNREGIST 側を削除
    await fs.rm(src, { recursive: true, force: true });
    return { ok: true, message: `入換完了: ${dst}`, path: dst };
  } catch (e: any) {
    return { ok: false, message: `入換失敗: ${e.message}`, path: null };
  }
}

async function copyRecursive(src: string, dst: string) {
  const st = await fs.stat(src);
  if (st.isDirectory()) {
    await fs.mkdir(dst, { recursive: true });
    const entries = await fs.readdir(src);
    for (const e of entries) {
      await copyRecursive(path.join(src, e), path.join(dst, e));
    }
  } else {
    await fs.copyFile(src, dst);
  }
}

/**
 * 旧 PHP /admin_new/deleteDBandBook.php の代替。
 *   tb_bok から bok_txt1 が一致するレコードを削除し、COMIC_ROOT/bookPath を rm -rf。
 */
export async function deleteDBandBook(bookPath: string): Promise<{
  ok: boolean;
  message: string;
  path: string | null;
}> {
  const books = process.env.COMIC_ROOT;
  if (!books) {
    return { ok: false, message: "COMIC_ROOT が設定されていません", path: null };
  }
  const rel = bookPath.replace(/^\/+/, "");
  const full = path.join(books, rel);
  if (!full.startsWith(path.resolve(books))) {
    return { ok: false, message: "パスが root の外を指しています", path: null };
  }
  try {
    // DB から該当行を削除
    const delResult = await prisma.volume.deleteMany({
      where: { folderPath: { contains: bookPath } },
    });
    // フォルダ削除（存在すれば）
    let removedFs = false;
    try {
      await fs.access(full);
      await fs.rm(full, { recursive: true, force: true });
      removedFs = true;
    } catch {
      /* not exist - OK */
    }
    return {
      ok: true,
      message: `DB ${delResult.count}件削除 / ${removedFs ? `FS削除: ${full}` : "FSは存在せず"}`,
      path: full,
    };
  } catch (e: any) {
    return { ok: false, message: `削除失敗: ${e.message}`, path: null };
  }
}

/**
 * 旧 PHP /admin_new/_folderRenane.php (改名) の代替。
 * oldDir → newDir に rename（同一root内）。両方が REGIST_DIR 配下 or 両方が COMIC_ROOT 配下。
 */
export async function renameRegistFolder(
  oldDir: string,
  newDir: string,
  inRegist = true
): Promise<{ ok: boolean; message: string; path: string | null }> {
  const root = inRegist ? process.env.REGIST_DIR : process.env.COMIC_ROOT;
  if (!root) {
    return { ok: false, message: "root が設定されていません", path: null };
  }
  const oldP = path.join(root, oldDir.replace(/^\/+/, ""));
  const newP = path.join(root, newDir.replace(/^\/+/, ""));
  if (!oldP.startsWith(path.resolve(root)) || !newP.startsWith(path.resolve(root))) {
    return { ok: false, message: "パスが root の外を指しています", path: null };
  }
  try {
    await fs.mkdir(path.dirname(newP), { recursive: true });
    await fs.rename(oldP, newP);
    return { ok: true, message: `rename: ${oldP} → ${newP}`, path: newP };
  } catch (e: any) {
    return { ok: false, message: `rename失敗: ${e.message}`, path: null };
  }
}
