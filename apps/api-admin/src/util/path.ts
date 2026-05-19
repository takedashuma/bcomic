import path from "node:path";

export const COMIC_ROOT = process.env.COMIC_ROOT ?? "/comics";
/** rar/zip 入りの新規データを置く場所（クローリングや解凍結果の置き場） */
export const STAGING_ROOT = process.env.STAGING_ROOT ?? "/staging";

/**
 * COMIC_ROOT 配下に絶対パスを解決し、外に出ていないことを検証する
 */
export function resolveUnderRoot(root: string, rel: string): string | null {
  if (!rel) return null;
  const cleaned = rel.replace(/^\/+/, "");
  const absolute = path.resolve(root, cleaned);
  const rootResolved = path.resolve(root);
  if (!absolute.startsWith(rootResolved + path.sep) && absolute !== rootResolved) {
    return null;
  }
  return absolute;
}
