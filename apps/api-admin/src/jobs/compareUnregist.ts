import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "../db.js";

/**
 * 旧 PHP /admin_new/comparNo.php の代替。
 * UNREGIST (REGIST_DIR) 配下を再帰スキャンして、葉フォルダ (巻フォルダ) を一覧化。
 * 各エントリで tb_bok を引いて「既存の同タイトル巻」を stock として返す。
 *
 * 想定フォルダ構成:
 *   <REGIST_DIR>/<initial>/[Author;著者] Title;タイトル/<volume>/...
 *   例:           /I/[IchibuSaki,ShirotoriUshio;一分咲,白鳥うしお] Moto OchikoboreKoushakuReijo;元、落ちこぼれ公爵令嬢です。THE COMIC/01/
 */

export interface CompareEntry {
  folderPath: string;       // 相対パス "/<initial>/<authorTitle>/<volume>"
  authorHead: string;       // 先頭1文字 ("I")
  authorTitleFolder: string;// "[Author;著者] Title;タイトル"
  authorJa: string;
  titleJa: string;
  volumeNo: string;         // "01"
  stockVolumes: string[];   // 同タイトルでDBに既にある巻 ["01","02","03"]
  stockCount: number;
  alreadyInDb: boolean;     // この volumeNo が既に登録されているか
  existingBokMid: number | null;
}

export interface CompareResult {
  ok: boolean;
  baseDir: string;
  entries: CompareEntry[];
  totalEntries: number;
  logs: string[];
}

async function scanLeafFolders(root: string): Promise<string[]> {
  // 深さ3 (initial / authorTitle / volume) のフォルダを葉として収集
  const result: string[] = [];
  async function walk(dir: string, depth: number) {
    let entries: string[];
    try {
      entries = await fs.readdir(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      if (name === ".DS_Store" || name === "@eaDir") continue;
      const p = path.join(dir, name);
      let st;
      try {
        st = await fs.stat(p);
      } catch {
        continue;
      }
      if (!st.isDirectory()) continue;
      if (depth === 3) {
        result.push(p); // /initial/authorTitle/volume
      } else if (depth < 3) {
        await walk(p, depth + 1);
      }
    }
  }
  await walk(root, 1);
  return result.sort();
}

function parsePath(rel: string): {
  initial: string;
  authorTitleFolder: string;
  volume: string;
  authorJa: string;
  titleJa: string;
} | null {
  // /I/[Author;著者] Title;タイトル/01
  const parts = rel.split("/").filter(Boolean);
  if (parts.length < 3) return null;
  const initial = parts[0];
  const authorTitleFolder = parts[1];
  const volume = parts[2];

  // "[Author;著者] Title;タイトル" を分解
  let authorJa = "";
  let titleJa = "";
  const m = /^\[([^\]]*)\]\s*(.+)$/.exec(authorTitleFolder);
  if (m) {
    const authorPart = m[1]; // "Author;著者" or "Author1,Author2;著者1,著者2"
    const titlePart = m[2];  // "Title;タイトル"
    // 日本語著者は `;` の後
    const authorSplit = authorPart.split(";");
    authorJa = authorSplit[1] || authorSplit[0] || "";
    const titleSplit = titlePart.split(";");
    titleJa = titleSplit[1] || titleSplit[0] || "";
  }
  return { initial, authorTitleFolder, volume, authorJa, titleJa };
}

export async function compareUnregist(): Promise<CompareResult> {
  const logs: string[] = [];
  const root = process.env.REGIST_DIR;
  if (!root) {
    return {
      ok: false,
      baseDir: "",
      entries: [],
      totalEntries: 0,
      logs: ["REGIST_DIR が設定されていません"],
    };
  }
  logs.push(`scan: ${root}`);
  let leafs: string[];
  try {
    leafs = await scanLeafFolders(root);
  } catch (e: any) {
    return {
      ok: false,
      baseDir: root,
      entries: [],
      totalEntries: 0,
      logs: [`[error] scan failed: ${e.message}`],
    };
  }
  logs.push(`found ${leafs.length} leaf folder(s)`);

  const entries: CompareEntry[] = [];
  for (const full of leafs) {
    const rel = "/" + path.relative(root, full).replace(/\\/g, "/");
    const parsed = parsePath(rel);
    if (!parsed) continue;
    const { initial, authorTitleFolder, volume, authorJa, titleJa } = parsed;

    // tb_bok から同タイトルの巻一覧を取得
    let dbRows: any[] = [];
    if (titleJa) {
      try {
        dbRows = await prisma.volume.findMany({
          where: {
            deletedAt: null,
            titleJa: { contains: titleJa },
          },
          orderBy: { no: "asc" },
          take: 100,
          select: { id: true, no: true, noJa: true, folderPath: true },
        });
      } catch {
        dbRows = [];
      }
    }
    const stockVolumes = dbRows.map((r) => r.no || r.noJa || "").filter(Boolean);

    // 同じ volume が既に DB にあるか
    const existing = dbRows.find((r) => (r.no || r.noJa) === volume);

    entries.push({
      folderPath: rel,
      authorHead: initial,
      authorTitleFolder,
      authorJa,
      titleJa,
      volumeNo: volume,
      stockVolumes,
      stockCount: stockVolumes.length,
      alreadyInDb: !!existing,
      existingBokMid: existing?.id ?? null,
    });
  }

  return {
    ok: true,
    baseDir: root,
    entries,
    totalEntries: entries.length,
    logs,
  };
}
