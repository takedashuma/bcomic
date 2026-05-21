import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { appendLog, runJobAsync, type JobState } from "./jobStore.js";

/**
 * 見開き画像の左右余白除去 + 分割ジョブ。
 *
 * 入力 (1巻フォルダ):
 *   <vol_dir>/001.jpg, 002.jpg, ...
 *
 * 処理:
 *   - 1ページ目 (表紙): 左右の余白を自動カットのみ (分割しない)
 *   - 2ページ目以降:    左右の余白を自動カット → 縦方向に半分に分割
 *                        漫画右綴じのため 右半分 → 左半分 の順で出力
 *
 * 出力:
 *   <vol_dir>/<vol_dir name>/001.jpg, 002.jpg, ...
 *   例: /.../02/02/001.jpg
 *   ※ 原本はそのまま残す。出力サブフォルダは "親フォルダと同名 (巻数)"。
 *
 * 余白判定 (黒余白特化):
 *   各列の平均輝度を測り、`blackMax` 以下なら "黒余白" 列とみなす。
 *   左端 / 右端 から連続している黒余白の幅を返す。
 *   平均を使うので、黒の中に多少の圧縮ノイズが散っていても吸収できる。
 */

const IMG_RE = /\.(jpe?g|png|webp|bmp|gif)$/i;

export interface SplitSpreadOpts {
  /** 対象巻フォルダ (相対パス。REGIST_DIR / COMIC_ROOT 配下) */
  folderPath: string;
  /** REGIST_DIR を root にするか (false = COMIC_ROOT) */
  inRegist?: boolean;
  /** 各列の平均輝度がこの値以下なら "黒余白" 扱い (0-255) */
  blackMax?: number;
  /** 検出する最小余白幅 (px) */
  minMargin?: number;
  /** 検出する最大余白幅 (px) */
  maxMargin?: number;
  /** JPEG 品質 */
  jpegQuality?: number;
}

function rootOf(inRegist: boolean): string {
  const r = inRegist ? process.env.REGIST_DIR : process.env.COMIC_ROOT;
  if (!r) {
    throw new Error(
      inRegist ? "REGIST_DIR が設定されていません" : "COMIC_ROOT が設定されていません"
    );
  }
  return path.resolve(r);
}

function pad3(n: number): string {
  return String(n).padStart(3, "0");
}

/**
 * 各列の平均輝度から、左右の「黒余白」幅 (px) を検出する。
 * 平均が `blackMax` 以下の列を黒余白とみなす。
 */
function detectHorizontalMargins(
  data: Buffer,
  width: number,
  height: number,
  channels: number,
  blackMax: number,
  minMargin: number,
  maxMargin: number
): { left: number; right: number } {
  // 行をサンプリング (最大 200 行)
  const step = Math.max(1, Math.floor(height / 200));
  const colSum = new Float64Array(width);
  let nrows = 0;

  for (let y = 0; y < height; y += step) {
    nrows++;
    const rowOff = y * width * channels;
    for (let x = 0; x < width; x++) {
      const px = rowOff + x * channels;
      let v: number;
      if (channels >= 3) {
        v = ((data[px] | 0) + (data[px + 1] | 0) + (data[px + 2] | 0)) / 3;
      } else {
        v = data[px] | 0;
      }
      colSum[x] += v;
    }
  }

  const colMean = new Float64Array(width);
  for (let x = 0; x < width; x++) {
    colMean[x] = nrows > 0 ? colSum[x] / nrows : 0;
  }
  const isBlack = (x: number): boolean => colMean[x] <= blackMax;

  let left = 0;
  for (let x = 0; x < width; x++) {
    if (isBlack(x)) left++;
    else break;
  }
  let right = 0;
  for (let x = width - 1; x >= 0; x--) {
    if (isBlack(x)) right++;
    else break;
  }

  left = Math.min(Math.max(left, 0), maxMargin);
  right = Math.min(Math.max(right, 0), maxMargin);
  if (left < minMargin) left = 0;
  if (right < minMargin) right = 0;
  return { left, right };
}

async function listImages(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir);
  return entries
    .filter((n) => IMG_RE.test(n) && !n.startsWith("."))
    .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
}

export function startSplitSpread(opts: SplitSpreadOpts): JobState {
  return runJobAsync("splitSpread", async (jobId) => {
    const root = rootOf(opts.inRegist ?? true);
    const folder = path.resolve(root, opts.folderPath.replace(/^\/+/, ""));
    if (!folder.startsWith(root + path.sep) && folder !== root) {
      throw new Error("パスが root の外を指しています");
    }
    const stat = await fs.stat(folder).catch(() => null);
    if (!stat?.isDirectory()) {
      throw new Error(`巻フォルダが見つかりません: ${folder}`);
    }
    appendLog(jobId, `target:   ${folder}`);

    const blackMax = opts.blackMax ?? 60;
    const minMargin = opts.minMargin ?? 5;
    const maxMargin = opts.maxMargin ?? 1200;
    const quality = opts.jpegQuality ?? 92;

    // 出力先 = 巻フォルダ直下の「同名 (巻数) サブフォルダ」
    const volName = path.basename(folder);
    const out = path.join(folder, volName);
    await fs.mkdir(out, { recursive: true });
    appendLog(jobId, `output:   ${out}`);

    const images = await listImages(folder);
    appendLog(jobId, `found ${images.length} image(s)`);

    let seq = 1;
    for (let idx = 0; idx < images.length; idx++) {
      const name = images[idx];
      const inPath = path.join(folder, name);
      let raw: { data: Buffer; info: sharp.OutputInfo };
      try {
        raw = await sharp(inPath).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      } catch (e: any) {
        appendLog(jobId, `  [error] decode ${name}: ${e.message}`);
        continue;
      }
      const { width, height, channels } = raw.info;
      const { left, right } = detectHorizontalMargins(
        raw.data,
        width,
        height,
        channels,
        blackMax,
        minMargin,
        maxMargin
      );

      const ext = path.extname(name).toLowerCase();
      const outExt = ext === ".jpeg" ? ".jpg" : ext === ".png" || ext === ".webp" ? ext : ".jpg";

      const cropW = Math.max(1, width - left - right);
      const base = sharp(inPath).extract({
        left,
        top: 0,
        width: cropW,
        height,
      });

      if (idx === 0) {
        const target = path.join(out, pad3(seq++) + outExt);
        await saveSharp(base, target, outExt, quality);
        appendLog(jobId, `  [cover] ${name}  trim L=${left} R=${right} → ${path.basename(target)}`);
      } else {
        const half = Math.floor(cropW / 2);
        const tR = path.join(out, pad3(seq++) + outExt);
        const tL = path.join(out, pad3(seq++) + outExt);
        const rightPage = sharp(inPath).extract({
          left: left + half,
          top: 0,
          width: cropW - half,
          height,
        });
        const leftPage = sharp(inPath).extract({
          left,
          top: 0,
          width: half,
          height,
        });
        await saveSharp(rightPage, tR, outExt, quality);
        await saveSharp(leftPage, tL, outExt, quality);
        appendLog(
          jobId,
          `  [split] ${name}  trim L=${left} R=${right} → ${path.basename(tR)} (R), ${path.basename(
            tL
          )} (L)`
        );
      }
    }

    return {
      message: `分割完了: ${images.length} 枚 → ${seq - 1} 枚`,
      outputs: [out],
    };
  });
}

async function saveSharp(
  pipeline: sharp.Sharp,
  target: string,
  ext: string,
  quality: number
): Promise<void> {
  if (ext === ".jpg") {
    await pipeline.jpeg({ quality, mozjpeg: false }).toFile(target);
  } else if (ext === ".webp") {
    await pipeline.webp({ quality }).toFile(target);
  } else {
    await pipeline.png().toFile(target);
  }
}
