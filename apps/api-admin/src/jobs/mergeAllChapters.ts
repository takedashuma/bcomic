import fs from "node:fs/promises";
import path from "node:path";
import { appendLog, runJobAsync, type JobState } from "./jobStore.js";

/**
 * 環境変数で指定されたディレクトリ配下の各作品フォルダで、
 * 「話別フォルダ (01話, 02話, ... or 01_xxx)」を 1つの巻フォルダ "01" にまとめる。
 *
 * 参考: 旧 PHP /comicUnzip/04_Chapter.php
 */

const CHAPTER_RE = /^\d+話?$|^\d+_/i;

async function mergeOne(jobId: string, workDir: string): Promise<{ ok: boolean; merged?: string; fileCount?: number }> {
  const entries = await fs.readdir(workDir, { withFileTypes: true });
  const chapterDirs = entries
    .filter((e) => e.isDirectory() && CHAPTER_RE.test(e.name))
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b, "ja", { numeric: true }));

  if (chapterDirs.length === 0) return { ok: false };

  const destDir = path.join(workDir, "01");
  await fs.mkdir(destDir, { recursive: true });
  let counter = 1;
  for (const ch of chapterDirs) {
    const chDir = path.join(workDir, ch);
    const files = (await fs.readdir(chDir))
      .filter((n) => /\.(jpe?g|png|webp|avif)$/i.test(n))
      .sort((a, b) => a.localeCompare(b, "ja", { numeric: true }));
    for (const f of files) {
      const padded = String(counter).padStart(4, "0");
      const newName = padded + path.extname(f).toLowerCase();
      await fs.rename(path.join(chDir, f), path.join(destDir, newName));
      counter++;
    }
    await fs.rmdir(chDir).catch(() => {});
    appendLog(jobId, `  merged: ${ch} (${files.length} files)`);
  }
  return { ok: true, merged: destDir, fileCount: counter - 1 };
}

export function startMergeAllChapters(opts: { sourceDir: string }): JobState {
  return runJobAsync("mergeAllChapters", async (jobId) => {
    appendLog(jobId, `source: ${opts.sourceDir}`);
    const top = await fs.readdir(opts.sourceDir, { withFileTypes: true });
    const works = top.filter((e) => e.isDirectory()).map((e) => path.join(opts.sourceDir, e.name));
    appendLog(jobId, `${works.length} 個の作品フォルダを検出`);
    const outputs: string[] = [];
    let okCount = 0;
    let skipCount = 0;
    for (const w of works) {
      appendLog(jobId, `[work] ${w}`);
      try {
        const r = await mergeOne(jobId, w);
        if (r.ok && r.merged) {
          outputs.push(r.merged);
          okCount++;
          appendLog(jobId, `  → ${r.merged} (${r.fileCount} files)`);
        } else {
          skipCount++;
          appendLog(jobId, `  skipped (no chapter folders)`);
        }
      } catch (e: any) {
        appendLog(jobId, `  [error] ${e.message}`);
        skipCount++;
      }
    }
    return {
      message: `話フォルダ結合: 完了。結合 ${okCount} 作品 / スキップ ${skipCount} 作品`,
      outputs,
    };
  });
}
