import fs from "node:fs/promises";
import path from "node:path";

/**
 * 旧 PHP /admin_new/search_unknown.php の代替。
 *
 * REGIST_DIR/0 配下のフォルダ一覧を返す。
 * フォルダ名形式: "[Unknown;Unknown] EnglishTitle;日本語タイトル"
 */

export interface UnknownFolderItem {
  folderName: string;       // "[Unknown;Unknown] X;Y"
  folderPath: string;       // 相対パス "/0/[Unknown;Unknown] X;Y"
  title: string;            // "X;Y"
  titleEN: string;
  titleJP: string;
}

export interface UnknownFoldersResult {
  ok: boolean;
  baseDir: string;
  items: UnknownFolderItem[];
  total: number;
  logs: string[];
}

export async function listUnknownFolders(): Promise<UnknownFoldersResult> {
  const logs: string[] = [];
  const registDir = process.env.REGIST_DIR;
  if (!registDir) {
    return {
      ok: false,
      baseDir: "",
      items: [],
      total: 0,
      logs: ["REGIST_DIR が設定されていません"],
    };
  }
  const baseDir = path.join(registDir, "0");
  logs.push(`scan: ${baseDir}`);

  let names: string[];
  try {
    names = await fs.readdir(baseDir);
  } catch (e: any) {
    return {
      ok: false,
      baseDir,
      items: [],
      total: 0,
      logs: [`[error] readdir failed: ${e.message}`],
    };
  }

  const items: UnknownFolderItem[] = [];
  for (const name of names) {
    if (name === ".DS_Store" || name === "@eaDir") continue;
    if (/^DS_|@/.test(name)) continue;
    const full = path.join(baseDir, name);
    let st;
    try {
      st = await fs.stat(full);
    } catch {
      continue;
    }
    if (!st.isDirectory()) continue;

    // "[Unknown;Unknown] EnglishTitle;日本語タイトル" → titleEN / titleJP
    const title = name.replace(/^\[Unknown;Unknown\]\s*/, "");
    const sp = title.split(";");
    const titleEN = (sp[0] || "").trim();
    const titleJP = (sp[1] || "").trim();

    items.push({
      folderName: name,
      folderPath: `/0/${name}`,
      title,
      titleEN,
      titleJP,
    });
  }
  items.sort((a, b) => a.folderName.localeCompare(b.folderName, "ja"));
  logs.push(`found ${items.length} item(s)`);

  return {
    ok: true,
    baseDir,
    items,
    total: items.length,
    logs,
  };
}
