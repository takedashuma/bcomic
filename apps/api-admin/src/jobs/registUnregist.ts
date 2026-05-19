import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "../db.js";
import { appendLog, runJobAsync, type JobState } from "./jobStore.js";

/**
 * 旧 PHP /admin_new/dirRead.php の代替。
 *
 * UNREGIST (REGIST_DIR) 配下の深さ3フォルダ
 *   <initial>/[Author;著者] Title;タイトル/<volume>
 * を全て tb_bok に INSERT し、最後にコンテンツを COMIC_ROOT へコピー後 UNREGIST を空にする。
 *
 * 非同期ジョブ。jobStatus(id) で進捗確認。
 */

const DIR_DEPTH = 3;

async function scanLeafFolders(root: string): Promise<string[]> {
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
      if (/^DS_|@/.test(name)) continue;
      const p = path.join(dir, name);
      let st;
      try {
        st = await fs.stat(p);
      } catch {
        continue;
      }
      if (!st.isDirectory()) continue;
      if (depth === DIR_DEPTH) {
        result.push(p);
      } else if (depth < DIR_DEPTH) {
        await walk(p, depth + 1);
      }
    }
  }
  await walk(root, 1);
  return result.sort();
}

function parseRegistEntry(rel: string): {
  bok_vch0: string;  // initial
  bok_vch1: string;  // "AuthorEn;著者JP"
  bok_vch2: string;  // AuthorEn
  bok_vch6: string;  // 著者JP
  bok_vch3: string;  // TitleEn
  bok_vch7: string;  // タイトルJP
  bok_vch4: string;  // 巻数 (no)
  bok_vch8: string;  // 巻数表示
  bok_vch9: string;  // 'comic'
  bok_txt1: string;  // 相対パス
} | null {
  const parts = rel.split("/").filter(Boolean);
  if (parts.length < 3) return null;
  const initial = parts[0];
  const authorTitle = parts[1]; // "[Author;著者] Title;タイトル"
  const volume = parts[2];

  const m = /^\[([^\]]*)\]\s*(.+)$/.exec(authorTitle);
  if (!m) return null;
  const authorPart = m[1]; // "Author;著者"
  const titlePart = m[2];  // "Title;タイトル"
  const authorSplit = authorPart.split(";");
  const authorEn = authorSplit[0] || "";
  const authorJa = authorSplit[1] || authorEn;
  const titleSplit = titlePart.split(";");
  const titleEn = titleSplit[0] || "";
  const titleJa = titleSplit[1] || titleEn;

  return {
    bok_vch0: initial,
    bok_vch1: authorPart,
    bok_vch2: authorEn,
    bok_vch6: authorJa,
    bok_vch3: titleEn,
    bok_vch7: titleJa,
    bok_vch4: volume,
    bok_vch8: volume,
    bok_vch9: "comic",
    bok_txt1: rel,
  };
}

export function startRegistUnregistAll(): JobState {
  return runJobAsync("registUnregist", async (jobId) => {
    const unregist = process.env.REGIST_DIR;
    const books = process.env.COMIC_ROOT;
    if (!unregist || !books) {
      throw new Error("REGIST_DIR / COMIC_ROOT が設定されていません");
    }
    appendLog(jobId, `unregist: ${unregist}`);
    appendLog(jobId, `books:    ${books}`);
    const leafs = await scanLeafFolders(unregist);
    appendLog(jobId, `found ${leafs.length} leaf(s)`);

    let okCount = 0;
    let ngCount = 0;
    for (const full of leafs) {
      const rel = "/" + path.relative(unregist, full).replace(/\\/g, "/");
      const parsed = parseRegistEntry(rel);
      if (!parsed) {
        appendLog(jobId, `[skip] cannot parse: ${rel}`);
        ngCount++;
        continue;
      }
      try {
        // 自動採番でないので MAX+1
        const max = await prisma.volume.aggregate({ _max: { id: true } });
        const nextId = (max._max.id ?? 0) + 1;
        await prisma.volume.create({
          data: {
            id: nextId,
            topFolder: parsed.bok_vch0,
            authorJa1: parsed.bok_vch1,
            authorEn: parsed.bok_vch2,
            authorJa: parsed.bok_vch6,
            titleEn: parsed.bok_vch3,
            titleJa: parsed.bok_vch7,
            no: parsed.bok_vch4,
            noJa: parsed.bok_vch8,
            vch9: parsed.bok_vch9,
            folderPath: parsed.bok_txt1,
            draft: "1",
            point: 100,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        });
        appendLog(jobId, `[regist] id=${nextId} ${rel}`);
        okCount++;
      } catch (e: any) {
        appendLog(jobId, `[error] ${rel}: ${e.message}`);
        ngCount++;
      }
    }

    // コピーフェーズ: UNREGIST/* → BOOKS/ で上書きコピーし、UNREGIST を空にする
    appendLog(jobId, `copy phase: ${unregist}/* → ${books}/`);
    try {
      const tops = await fs.readdir(unregist);
      for (const t of tops) {
        if (t === ".DS_Store" || t === "@eaDir") continue;
        const src = path.join(unregist, t);
        const dst = path.join(books, t);
        await copyRecursiveMerge(src, dst);
      }
      // UNREGIST 配下を全削除
      const tops2 = await fs.readdir(unregist);
      for (const t of tops2) {
        await fs.rm(path.join(unregist, t), { recursive: true, force: true });
      }
      appendLog(jobId, "copy phase done");
    } catch (e: any) {
      appendLog(jobId, `[warn] copy phase failed: ${e.message}`);
    }

    return {
      message: `NormalComic登録: 完了。DB登録 ${okCount}件 / スキップ ${ngCount}件`,
      outputs: leafs,
    };
  });
}

async function copyRecursiveMerge(src: string, dst: string) {
  const st = await fs.stat(src);
  if (st.isDirectory()) {
    await fs.mkdir(dst, { recursive: true });
    const entries = await fs.readdir(src);
    for (const e of entries) {
      await copyRecursiveMerge(path.join(src, e), path.join(dst, e));
    }
  } else {
    await fs.copyFile(src, dst);
  }
}
