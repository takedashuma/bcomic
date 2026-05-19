import fs from "node:fs/promises";
import path from "node:path";

/**
 * 旧 PHP /comicUnzip/makeDir.php の代替:
 *   - dir パラメータは "/K/[Author;著者] Title;タイトル/" のような相対パス
 *   - REGIST_DIR 配下に dir をそのまま作成する
 *   - 親側 (頭文字 K, A, ..., 0) のフォルダも mkdir -p
 *
 * REGIST_DIR は環境変数で指定。docker-compose で /download_root/Regist にマウント想定。
 */
export async function makeRegistDir(relDir: string): Promise<{
  ok: boolean;
  message: string;
  path: string | null;
}> {
  const root = process.env.REGIST_DIR;
  if (!root) {
    return { ok: false, message: "REGIST_DIR が設定されていません", path: null };
  }
  if (!relDir) {
    return { ok: false, message: "dir が空です", path: null };
  }
  const cleaned = relDir.replace(/^\/+/, "");
  const absolute = path.resolve(root, cleaned);
  const rootResolved = path.resolve(root);
  if (!absolute.startsWith(rootResolved + path.sep) && absolute !== rootResolved) {
    return { ok: false, message: "REGIST_DIR の外には作成できません", path: null };
  }
  try {
    await fs.mkdir(absolute, { recursive: true });
    return { ok: true, message: `created: ${absolute}`, path: absolute };
  } catch (e: any) {
    return { ok: false, message: `mkdir failed: ${e.message}`, path: null };
  }
}
