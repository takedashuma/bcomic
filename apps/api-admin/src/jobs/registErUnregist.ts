import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "../db.js";
import { appendLog, runJobAsync, type JobState } from "./jobStore.js";
import { runCmd } from "./runtime.js";

/**
 * 旧 PHP /admin_new/dirRead.php?mode=ER の代替。
 *
 * ER (uDownloading) 配下の深さ3フォルダ
 *   <initial>/<EnName;JpName>/[JpName] JpTitle - [EnName] EnTitle/
 * を全て tb_bok に INSERT し、最後に ER_DEST_DIR → ER_COMIC_ROOT へ
 * 中身をコピー後、ER_DEST_DIR を空にする。
 *
 * 旧 PHP 版の挙動を踏襲:
 *   - bok_vch9 = "adult"
 *   - bok_int0 = 200
 *   - bok_flg0 = 1 (Draft)
 *   - 命名規則: 第3階層が "[JpName] JpTitle - [EnName] EnTitle"
 *
 * 環境変数:
 *   ER_DEST_DIR       (source: ERComic解凍後の整理先、例 /uDownloading)
 *   ER_COMIC_ROOT     (dest:   ERO本棚、例 /erc003 (= /Volumes/public/ERC/003))
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
      if (name === ".DS_Store" || name === "@eaDir" || name === "Thumbs.db") continue;
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

/**
 * ER の第3階層フォルダ名 "[JpName] JpTitle - [EnName] EnTitle" を分解。
 * "- [" を含まなければ EN/JP を同一として扱う (旧PHP挙動)。
 */
function parseErTitleFolder(titleFolder: string): {
  enName: string;
  jpName: string;
  enTitle: string;
  jpTitle: string;
} {
  if (titleFolder.includes(" - [")) {
    const idx = titleFolder.indexOf(" - [");
    const jpPart = titleFolder.slice(0, idx); // "[JpName] JpTitle"
    const enPart = titleFolder.slice(idx + 3); // "[EnName] EnTitle"
    const jp = jpPart.match(/^\[([^\]]+)\]\s+(.+)$/);
    const en = enPart.match(/^\[([^\]]+)\]\s+(.+)$/);
    if (jp && en) {
      return {
        jpName: jp[1].trim(),
        jpTitle: jp[2].trim(),
        enName: en[1].trim(),
        enTitle: en[2].trim(),
      };
    }
  }
  // No EN: fall back, same value for en/jp
  return {
    enName: titleFolder,
    jpName: titleFolder,
    enTitle: titleFolder,
    jpTitle: titleFolder,
  };
}

interface ErRegistEntry {
  initial: string;
  authorKey: string; // bok_vch1 "EnName;JpName"
  titleFolder: string;
  enName: string;
  jpName: string;
  enTitle: string;
  jpTitle: string;
  relPath: string;
}

function parseRelPath(rel: string): ErRegistEntry | null {
  const parts = rel.split("/").filter(Boolean);
  if (parts.length < 3) return null;
  const initial = parts[0];
  const authorKey = parts[1]; // "EnName;JpName"
  const titleFolder = parts[2];
  const names = parseErTitleFolder(titleFolder);
  return {
    initial,
    authorKey,
    titleFolder,
    relPath: rel,
    ...names,
  };
}

export function startRegistErUnregistAll(): JobState {
  return runJobAsync("registErUnregist", async (jobId) => {
    const unregist = process.env.ER_DEST_DIR;
    const erBooks = process.env.ER_COMIC_ROOT;
    if (!unregist) throw new Error("ER_DEST_DIR が設定されていません");
    if (!erBooks) throw new Error("ER_COMIC_ROOT が設定されていません");

    appendLog(jobId, `unregist (source):   ${unregist}`);
    appendLog(jobId, `erBooks  (final dst): ${erBooks}`);

    const leafs = await scanLeafFolders(unregist);
    appendLog(jobId, `found ${leafs.length} leaf folder(s)`);

    let okCount = 0;
    let ngCount = 0;
    for (const full of leafs) {
      const rel = "/" + path.relative(unregist, full).replace(/\\/g, "/");
      const parsed = parseRelPath(rel);
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
            topFolder: parsed.initial,        // bok_vch0
            authorJa1: parsed.authorKey,      // bok_vch1 "EnName;JpName"
            authorEn: parsed.enName,          // bok_vch2
            authorJa: parsed.jpName,          // bok_vch6
            titleEn: parsed.enTitle,          // bok_vch3
            titleJa: parsed.jpTitle,          // bok_vch7
            no: parsed.titleFolder,           // bok_vch4 (旧PHP は title folder 全体を使用)
            noJa: parsed.titleFolder,         // bok_vch8
            vch9: "adult",
            folderPath: parsed.relPath,
            draft: "1",
            point: 200,
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

    // コピーフェーズ: ER_DEST_DIR/* → ER_COMIC_ROOT/ (cp -a + 件数検証)
    appendLog(jobId, `copy phase: ${unregist}/* → ${erBooks}/`);
    try {
      await fs.mkdir(erBooks, { recursive: true });
      // ER_DEST_DIR の中身をすべて erBooks にコピー
      const cp = await runCmd("cp", ["-a", unregist + "/.", erBooks]);
      for (const line of cp.logs.slice(-20)) appendLog(jobId, `  ${line}`);
      if (cp.code !== 0) {
        throw new Error(`cp -a failed code=${cp.code}`);
      }
      // ER_DEST_DIR 配下を全削除 (空にする)
      const tops = await fs.readdir(unregist);
      for (const t of tops) {
        if (t === ".DS_Store" || t === "@eaDir" || t === "Thumbs.db") continue;
        await fs.rm(path.join(unregist, t), { recursive: true, force: true });
      }
      appendLog(jobId, "copy phase done");
    } catch (e: any) {
      appendLog(jobId, `[warn] copy phase failed: ${e.message}`);
    }

    return {
      message: `ERO Comic登録: 完了。DB登録 ${okCount}件 / スキップ ${ngCount}件`,
      outputs: leafs,
    };
  });
}
