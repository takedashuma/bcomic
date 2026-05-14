import path from "node:path";
import fs from "node:fs/promises";

export const COMIC_ROOT = process.env.COMIC_ROOT ?? "/comics";

/**
 * tb_bok.bok_txt1 のフォルダパスを COMIC_ROOT 配下の絶対パスに解決する。
 * パストラバーサル攻撃を防止し、必ず COMIC_ROOT 配下になることを保証。
 */
export function resolveVolumeFolder(folderPath: string | null | undefined): string | null {
  if (!folderPath) return null;
  // 先頭の "/" を取り除いて COMIC_ROOT と結合
  const cleaned = folderPath.replace(/^\/+/, "");
  const absolute = path.resolve(COMIC_ROOT, cleaned);
  const rootResolved = path.resolve(COMIC_ROOT);
  if (!absolute.startsWith(rootResolved + path.sep) && absolute !== rootResolved) {
    return null;
  }
  return absolute;
}

/**
 * 巻フォルダ内のページ画像をソート済みで列挙
 */
export async function listVolumePages(folderAbsolute: string): Promise<string[]> {
  let entries: string[] = [];
  try {
    entries = await fs.readdir(folderAbsolute);
  } catch {
    return [];
  }
  return entries
    .filter((n) => /\.(jpe?g|png|webp|avif)$/i.test(n))
    .sort((a, b) => a.localeCompare(b, "ja", { numeric: true }));
}

/**
 * 巻フォルダの最初の1ページ目（カバー画像）を返す
 */
export async function getCoverPage(folderAbsolute: string): Promise<string | null> {
  const pages = await listVolumePages(folderAbsolute);
  return pages[0] ?? null;
}
