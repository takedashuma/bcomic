import fs from "node:fs/promises";
import path from "node:path";
import { runCmd } from "./runtime.js";
import { appendLog, runJobAsync, type JobState } from "./jobStore.js";

/**
 * 一括解凍ジョブ。
 *
 * 出力ルール:
 *   <UNZIP_DEST>/<title>/<volume>/001.jpg, 002.jpg, ...
 *
 *   - <title>   : アーカイブ名から推定。"... v09" / "... 第09巻" などから volume を切り出し、
 *                 残りを title とする。切り出せない場合は archive 名そのもの。
 *   - <volume>  : 単一巻の場合: 上で切り出した volume (例 "09")
 *                 単一巻 & 数字なしの場合: title を流用
 *                 複数巻の場合: 各内側フォルダ名から数字部分を抽出
 *
 * 内部レイアウト:
 *   - 単一コミック     : フラットでも、ラッパー1段以上深くても対応
 *   - 複数コミック     : ラッパー配下に複数の巻フォルダ。各巻フォルダ内に
 *                        さらに何階層あっても (再帰探索で) 画像を収集
 *
 * 正規化:
 *   全角数字 → 半角 / 全角空白 → 半角 / 禁則文字 → 全角 / 巻数 0埋め2桁 (≥100はそのまま)
 *
 * 画像連番:
 *   最低3桁 0埋め (001..) 、画像枚数が1000を超えるなら自動で4桁以上に拡張
 */
const ARCHIVE_EXTS = [".zip", ".rar", ".7z", ".cbz", ".cbr"];
const IMG_RE = /\.(jpe?g|png|webp|avif|gif|bmp)$/i;

// ===== 文字列正規化 =====
function toHalfwidthDigits(s: string): string {
  return s.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
}
function toHalfwidthSpace(s: string): string {
  return s.replace(/　/g, " ");
}
const FORBIDDEN_MAP: Record<string, string> = {
  "<": "＜",
  ">": "＞",
  ":": "：",
  '"': "＂",
  "/": "／",
  "\\": "＼",
  "|": "｜",
  "?": "？",
  "*": "＊",
};
function escapeForbiddenChars(s: string): string {
  return s.replace(/[<>:"/\\|?*]/g, (c) => FORBIDDEN_MAP[c] ?? c);
}
function normalizeName(s: string): string {
  return escapeForbiddenChars(toHalfwidthSpace(toHalfwidthDigits(s))).trim();
}

// ===== パディング =====
function padVolume(n: number): string {
  return n < 100 ? String(n).padStart(2, "0") : String(n);
}
function imagePadLen(total: number): number {
  return Math.max(3, String(total).length);
}
function padImage(n: number, total: number): string {
  return String(n).padStart(imagePadLen(total), "0");
}

// ===== アーカイブ名のパース =====
/**
 * アーカイブ名から (タイトル, 巻数) を抽出。
 * 単一巻が読み取れたときだけ volume を返す。`v01-03` のような範囲指定は volume=null。
 */
export function parseArchiveBaseName(baseName: string): { title: string; volume: string | null } {
  const normalized = normalizeName(baseName);

  // 範囲表記 "v01-03" "v04-05" などはタイトル扱い (volumeは抽出しない)
  if (/\bv?(?:ol\.?)?\s*\d+\s*[-〜~]\s*\d+\b/i.test(normalized)) {
    return { title: normalized, volume: null };
  }

  // "Title v07" / "Title_v07" / "Titlev07" / "Title vol.07" → title="Title" / volume="07"
  // 区切り (空白/アンダースコア) は任意。
  let m = /^(.+?)[\s_]*v(?:ol\.?)?\s*(\d+)$/i.exec(normalized);
  if (m) return { title: m[1].trim().replace(/[\s_]+$/, ""), volume: padVolume(parseInt(m[2], 10)) };

  // "Title 02s" / "Title_02s" / "Title02s" → title="Title" / volume="02s"
  // 特装版・特別編 等の数字+s 接尾辞を保持する
  m = /^(.+?)[\s_]*(\d+)s$/i.exec(normalized);
  if (m) {
    const title = m[1].trim().replace(/[\s_]+$/, "");
    if (title) {
      return { title, volume: padVolume(parseInt(m[2], 10)) + "s" };
    }
  }

  m = /^(.+?)[\s_]*(?:第\s*)?(\d+)\s*巻$/.exec(normalized);
  if (m) return { title: m[1].trim().replace(/[\s_]+$/, ""), volume: padVolume(parseInt(m[2], 10)) };

  m = /^(.+\S)[\s_]+(\d+)$/.exec(normalized);
  if (m && /\D/.test(m[1])) {
    return { title: m[1].trim().replace(/[\s_]+$/, ""), volume: padVolume(parseInt(m[2], 10)) };
  }

  return { title: normalized, volume: null };
}

/**
 * 内側のフォルダ名から巻数を抽出 (優先順: 第NN巻 > vNN > NNs > 末尾数字 > 先頭数字)。
 *   "[一分咲×白鳥うしお] 元、…THE COMIC 第01巻" → "01"
 *   "Moto_ochikobore_koshaku_v04"               → "04"
 *   "Title_02s"                                  → "02s"   (特装版・特別編 等)
 *   "02s"                                        → "02s"
 *   "01"                                         → "01"
 */
export function parseInnerFolderToVolume(name: string): string {
  const normalized = normalizeName(name);
  let m = /第\s*(\d+)\s*巻/.exec(normalized);
  if (m) return padVolume(parseInt(m[1], 10));
  m = /[vV](?:ol\.?)?\s*(\d+)(?!\s*[-〜~])/i.exec(normalized);
  if (m) return padVolume(parseInt(m[1], 10));
  // 末尾が「数字+s」(特装版・特別編 等の命名規約) → "02s" を保持
  m = /(\d+)s\s*$/i.exec(normalized);
  if (m) return padVolume(parseInt(m[1], 10)) + "s";
  m = /(\d+)\s*$/.exec(normalized);
  if (m) return padVolume(parseInt(m[1], 10));
  m = /(\d+)/.exec(normalized);
  if (m) return padVolume(parseInt(m[1], 10));
  return normalized || "01";
}

// ===== FS ヘルパ =====
async function ensureDir(p: string) {
  await fs.mkdir(p, { recursive: true });
}

/**
 * macOS の APFS と Docker (virtiofs) の間で日本語ファイル名の正規化形式
 * (NFC vs NFD) がズレることがあり、組み立てたパスを直接アクセスすると
 * ENOENT になるケースが頻発する。本関数は NFC/NFD/原文の3パターンを試行し、
 * アクセス可能だったパスを返す（見つからなければ null）。
 */
async function pickAccessiblePath(p: string): Promise<string | null> {
  const variants = new Set<string>([p, p.normalize("NFC"), p.normalize("NFD")]);
  for (const v of variants) {
    try {
      await fs.access(v);
      return v;
    } catch {
      /* try next */
    }
  }
  return null;
}

async function readdirSafe(dir: string): Promise<string[]> {
  // 親ディレクトリ自体の正規化候補もケアする
  const variants = new Set<string>([dir, dir.normalize("NFC"), dir.normalize("NFD")]);
  for (const v of variants) {
    try {
      return await fs.readdir(v);
    } catch {
      /* try next */
    }
  }
  // すべて失敗
  throw new Error(`readdir ENOENT (NFC/NFD両方失敗): ${dir}`);
}

async function statSafe(p: string): Promise<{ isDir: boolean; resolved: string } | null> {
  const variants = new Set<string>([p, p.normalize("NFC"), p.normalize("NFD")]);
  for (const v of variants) {
    try {
      const st = await fs.stat(v);
      return { isDir: st.isDirectory(), resolved: v };
    } catch {
      /* try next */
    }
  }
  return null;
}

async function listImages(dir: string): Promise<string[]> {
  try {
    const entries = await readdirSafe(dir);
    return entries
      .filter((n) => IMG_RE.test(n))
      .sort((a, b) => a.localeCompare(b, "ja", { numeric: true }));
  } catch {
    return [];
  }
}
async function listSubdirs(dir: string): Promise<string[]> {
  try {
    const entries = await readdirSafe(dir);
    const subs: string[] = [];
    for (const n of entries) {
      const child = path.join(dir, n);
      const s = await statSafe(child);
      if (s?.isDir) subs.push(n);
    }
    return subs.sort((a, b) => a.localeCompare(b, "ja", { numeric: true }));
  } catch {
    return [];
  }
}

/**
 * 任意の階層から再帰的に全画像のフルパスを収集し、自然順で並べる。
 * macOS Docker (virtiofs) の NFC/NFD ミスマッチに耐えるため、
 * 各ステップで readdirSafe / statSafe を使う。
 */
async function collectAllImagesRecursive(start: string, jobId?: string): Promise<string[]> {
  const items: { full: string; rel: string }[] = [];
  async function walk(dir: string) {
    // 親自体のアクセス可能なパスを確定
    const accessibleDir = (await pickAccessiblePath(dir)) ?? dir;
    let entries: string[];
    try {
      entries = await readdirSafe(accessibleDir);
    } catch (e: any) {
      if (jobId) appendLog(jobId, `  [warn] readdir failed: ${dir}: ${e.message}`);
      return;
    }
    for (const name of entries) {
      const childRaw = path.join(accessibleDir, name);
      const s = await statSafe(childRaw);
      if (!s) {
        if (jobId) appendLog(jobId, `  [warn] stat failed: ${childRaw}`);
        continue;
      }
      const childAccessible = s.resolved;
      if (s.isDir) {
        await walk(childAccessible);
      } else if (IMG_RE.test(name)) {
        items.push({ full: childAccessible, rel: path.relative(start, childAccessible) });
      }
    }
  }
  await walk(start);
  items.sort((a, b) => a.rel.localeCompare(b.rel, "ja", { numeric: true }));
  return items.map((i) => i.full);
}

/**
 * rename を試み、失敗時(EXDEV など)は copy + unlink にフォールバックする。
 * Docker bind mount 越境などで rename が EXDEV を返すケースを救う。
 */
async function moveFileResilient(src: string, dst: string): Promise<void> {
  try {
    await fs.rename(src, dst);
    return;
  } catch (e: any) {
    if (e?.code === "EXDEV" || e?.code === "EPERM" || e?.code === "ENOTSUP") {
      await fs.copyFile(src, dst);
      await fs.unlink(src);
      return;
    }
    throw e;
  }
}

/**
 * tempDir 配下のレイアウト判定。
 * 「巻フォルダかどうか」の判定は ”再帰的に1個でも画像を含むサブフォルダがあるか” で見る。
 */
async function detectLayout(tempDir: string): Promise<{
  type: "single" | "multiple";
  workRoot: string;
  innerDirs?: string[];
}> {
  // 1段目で画像が直接あればすぐ single
  const rootImgs = await listImages(tempDir);
  if (rootImgs.length > 0) {
    return { type: "single", workRoot: tempDir };
  }
  const subdirs = await listSubdirs(tempDir);

  // 単一のラッパーフォルダ
  if (subdirs.length === 1) {
    const inner = path.join(tempDir, subdirs[0]);
    const innerImgs = await listImages(inner);
    const innerSubs = await listSubdirs(inner);
    if (innerImgs.length > 0) return { type: "single", workRoot: inner };
    if (innerSubs.length === 1) {
      // 多段ラッパーの可能性。さらに進む
      return detectLayout(inner);
    }
    if (innerSubs.length > 1) {
      return { type: "multiple", workRoot: inner, innerDirs: innerSubs };
    }
    // ラッパーすら空。ともかく single 扱い
    return { type: "single", workRoot: tempDir };
  }
  if (subdirs.length > 1) {
    return { type: "multiple", workRoot: tempDir, innerDirs: subdirs };
  }
  return { type: "single", workRoot: tempDir };
}

/**
 * volumeSrc 配下の画像を全て収集し、dstDir に 001.jpg ... 連番でリネームしながら移動。
 * rename が cross-device を返したら copy+unlink にフォールバック。
 * 失敗箇所はログに残し、最後に成功件数を返す。
 */
async function moveAndRenumber(jobId: string, volumeSrc: string, dstDir: string): Promise<number> {
  appendLog(jobId, `  scan: ${volumeSrc}`);
  const imgs = await collectAllImagesRecursive(volumeSrc, jobId);
  appendLog(jobId, `  found ${imgs.length} images`);
  if (imgs.length === 0) return 0;

  const total = imgs.length;
  let moved = 0;
  let failed = 0;
  for (let i = 0; i < imgs.length; i++) {
    const ext = path.extname(imgs[i]).toLowerCase();
    const finalName = `${padImage(i + 1, total)}${ext}`;
    let dst = path.join(dstDir, finalName);
    try {
      await fs.access(dst);
      const stamp = Date.now();
      dst = path.join(dstDir, `${padImage(i + 1, total)}__${stamp}${ext}`);
    } catch {
      /* not exist - OK */
    }
    try {
      await moveFileResilient(imgs[i], dst);
      moved++;
    } catch (e: any) {
      failed++;
      appendLog(jobId, `  [error] move failed: ${imgs[i]} → ${dst}: ${e.message}`);
    }
  }
  appendLog(jobId, `  → ${dstDir} (${moved}/${total} images${failed ? `, ${failed} failed` : ""})`);
  return moved;
}

async function extractOne(
  jobId: string,
  archivePath: string,
  unzipDestDir: string,
  archiveDoneDir: string
): Promise<{ ok: boolean; dests: string[] }> {
  const ext = path.extname(archivePath).toLowerCase();
  const archiveBase = path.basename(archivePath, ext);
  const parsed = parseArchiveBaseName(archiveBase);
  appendLog(jobId, `[extract] ${archivePath}`);
  appendLog(jobId, `  title="${parsed.title}" volume="${parsed.volume ?? "(none)"}"`);

  // 1) 一時ディレクトリに解凍
  const tempDir = path.join(
    path.dirname(archivePath),
    `__tmp_${process.pid}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  );
  await ensureDir(tempDir);

  let r: { code: number; logs: string[] };
  if (ext === ".zip" || ext === ".cbz" || ext === ".7z") {
    r = await runCmd("7z", ["x", "-y", `-o${tempDir}`, archivePath]);
  } else {
    r = await runCmd("unrar-free", ["-x", archivePath, tempDir]);
  }
  for (const line of r.logs) appendLog(jobId, line);
  if (r.code !== 0) {
    appendLog(jobId, `  [error] extract failed (exit=${r.code})`);
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    return { ok: false, dests: [] };
  }

  // 2) レイアウト判定
  const layout = await detectLayout(tempDir);
  appendLog(
    jobId,
    `  layout: ${layout.type}  workRoot=${layout.workRoot}  ${
      layout.innerDirs ? `innerDirs=${JSON.stringify(layout.innerDirs)}` : ""
    }`
  );
  const dests: string[] = [];

  try {
    if (layout.type === "single") {
      const volume = parsed.volume ?? parsed.title; // 数字が無ければタイトルを巻名に
      const dest = path.join(unzipDestDir, parsed.title, volume);
      appendLog(jobId, `  single → dest=${dest}`);
      await ensureDir(dest);
      await moveAndRenumber(jobId, layout.workRoot, dest);
      dests.push(dest);
    } else {
      for (const innerName of layout.innerDirs!) {
        const volume = parseInnerFolderToVolume(innerName);
        const dest = path.join(unzipDestDir, parsed.title, volume);
        const innerPathRaw = path.join(layout.workRoot, innerName);
        // NFC/NFD どちらでアクセスできるか確認
        const innerPath = (await pickAccessiblePath(innerPathRaw)) ?? innerPathRaw;
        appendLog(jobId, `  multi[${volume}] innerPath=${innerPath} → dest=${dest}`);
        await ensureDir(dest);
        await moveAndRenumber(jobId, innerPath, dest);
        dests.push(dest);
      }
    }
  } catch (e: any) {
    appendLog(jobId, `  [error] placement failed: ${e.message}`);
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    return { ok: false, dests };
  }

  // 3) 一時フォルダ片付け
  await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});

  // 4) 元アーカイブを退避
  await ensureDir(archiveDoneDir);
  let archiveTo = path.join(archiveDoneDir, path.basename(archivePath));
  try {
    await fs.access(archiveTo);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    archiveTo = path.join(archiveDoneDir, `${archiveBase}__${stamp}${ext}`);
  } catch {
    /* not exist - OK */
  }
  try {
    await fs.rename(archivePath, archiveTo);
    appendLog(jobId, `  archive → ${archiveTo}`);
  } catch (e: any) {
    appendLog(jobId, `  [warn] archive move failed: ${e.message}`);
  }

  return { ok: true, dests };
}

async function listArchives(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && ARCHIVE_EXTS.includes(path.extname(e.name).toLowerCase()))
    .map((e) => path.join(dir, e.name))
    .sort();
}

export function startExtractAllArchives(opts: {
  sourceDir: string;
  kindLabel: string;
  unzipDestDir: string;
  archiveDoneDir: string;
}): JobState {
  return runJobAsync("extractAllArchives", async (jobId) => {
    appendLog(jobId, `source : ${opts.sourceDir}`);
    appendLog(jobId, `unzip  : ${opts.unzipDestDir}`);
    appendLog(jobId, `archive: ${opts.archiveDoneDir}`);
    let files: string[];
    try {
      files = await listArchives(opts.sourceDir);
    } catch (e: any) {
      throw new Error(`source directory not accessible: ${e.message}`);
    }
    appendLog(jobId, `found ${files.length} archive(s)`);
    if (files.length === 0) {
      return { message: `${opts.kindLabel}: 解凍対象なし (0件)`, outputs: [] };
    }
    const outputs: string[] = [];
    let okCount = 0;
    let ngCount = 0;
    for (const f of files) {
      const r = await extractOne(jobId, f, opts.unzipDestDir, opts.archiveDoneDir);
      if (r.ok) {
        okCount++;
        outputs.push(...r.dests);
      } else {
        ngCount++;
      }
    }
    return {
      message: `${opts.kindLabel}: 完了。成功 ${okCount} 件 / 失敗 ${ngCount} 件`,
      outputs,
    };
  });
}
