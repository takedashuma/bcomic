import fs from "node:fs/promises";
import path from "node:path";
import { runCmd } from "./runtime.js";
import { appendLog, runJobAsync, type JobState } from "./jobStore.js";

/**
 * 旧 PHP /comicUnzip/10_ER_unarchive.php の代替。
 *
 * 2段階処理:
 *
 *  ----------- Part 1: Zip → Unzip (解凍 + 命名整理) -----------
 *    EXTRACT_ER_ARCHIVE_DIR (例 /download_root/Zip) を走査
 *      ・"(1)" 等の重複サフィックスを除去 (既存があれば zFin へ退避)
 *      ・setERReplace で禁則文字を全角化 / アンダースコア・全角スペースを半角に
 *      ・unrar / 7z で UNZIP_DEST_DIR (例 /download_root/Unzip) に展開
 *      ・元アーカイブを ARCHIVE_DONE_DIR (例 /download_root/zFin) に移動
 *
 *  ----------- Part 2: Unzip → ER_DEST_DIR (フォルダ名整理) -----------
 *    UNZIP_DEST_DIR 配下を深さ2でスキャン:
 *      <wrapper>/<authorTitle>
 *    authorTitle が "[JpName] JpTitle - [EnName] EnTitle" 形式なら分解し、
 *    ER_DEST_DIR/<cap>/<EnName;JpName>/[JpName] JpTitle - [EnName] EnTitle/
 *    に mkdir -p + mv + rmdir(wrapper)
 *
 *  必要な環境変数:
 *    EXTRACT_ER_ARCHIVE_DIR   解凍対象 zip/rar 置き場
 *    UNZIP_DEST_DIR_ER (or UNZIP_DEST_DIR)   解凍先
 *    ARCHIVE_DONE_DIR_ER (or ARCHIVE_DONE_DIR)   解凍済退避
 *    ER_DEST_DIR              フォルダ整理後の格納先 (例 /erc/uDownloading)
 */

const ARCHIVE_EXTS = [".rar", ".zip", ".cbz", ".cbr", ".7z"];

/** 旧 setERReplace 相当: 禁則文字・全角の正規化 */
function setERReplace(name: string): string {
  // 角括弧の中身空 → "xxx"
  let s = name.replace(/\[\]/g, "[xxx]");
  // 旧 search/replace 表 (`!` `！` `&` `%` `×` `_` `　` `☆` `（` `）`)
  const pairs: Array<[RegExp, string]> = [
    [/!/g, ""],
    [/！/g, ""],
    [/&/g, "＆"],
    [/%/g, "％"],
    [/×/g, ","],
    [/_/g, " "],
    [/　/g, " "],
    [/☆/g, " "],
    [/（/g, "("],
    [/）/g, ")"],
  ];
  for (const [re, to] of pairs) s = s.replace(re, to);
  s = s.replace(/\(完\)/g, "");
  // 連続空白を1つに
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function safeMove(jobId: string, src: string, dst: string) {
  await fs.mkdir(path.dirname(dst), { recursive: true });
  try {
    await fs.rename(src, dst);
    return true;
  } catch (e: any) {
    if (e?.code === "EXDEV") {
      // cross-device → cp -a + rm -rf
      const cp = await runCmd("cp", ["-a", src + "/.", dst]);
      if (cp.code !== 0) {
        appendLog(jobId, `[error] cp -a 失敗 ${src} → ${dst}: ${cp.logs.slice(-3).join(" / ")}`);
        return false;
      }
      await fs.rm(src, { recursive: true, force: true });
      return true;
    }
    appendLog(jobId, `[error] mv 失敗: ${e.message}`);
    return false;
  }
}

/** 拡張子で archive 判定 */
function isArchive(name: string): boolean {
  const lower = name.toLowerCase();
  return ARCHIVE_EXTS.some((e) => lower.endsWith(e));
}

// ========== Part 1: Zip → Unzip ==========
async function extractPhase(jobId: string, zipDir: string, unzipDir: string, doneDir: string) {
  appendLog(jobId, `[Part1] scan: ${zipDir}`);
  let names: string[];
  try {
    names = await fs.readdir(zipDir);
  } catch (e: any) {
    appendLog(jobId, `[Part1] readdir 失敗: ${e.message}`);
    return;
  }
  for (const orig of names) {
    if (!isArchive(orig)) continue;
    if (/^\.|^@eaDir$|^DS_/.test(orig)) continue;

    let name = orig;

    // "(1)" などの重複サフィックスを除去 / 既存ありなら zFin へ退避
    const dupMatch = /\s*\((\d)\)(\.[^.]+)$/.exec(name);
    if (dupMatch) {
      const cleaned = name.replace(/\s*\(\d\)\./, ".");
      const cleanedFull = path.join(zipDir, cleaned);
      if (!(await exists(cleanedFull))) {
        appendLog(jobId, `[Part1] rename (dup): ${name} → ${cleaned}`);
        await fs.rename(path.join(zipDir, name), cleanedFull);
        name = cleaned;
      } else {
        appendLog(jobId, `[Part1] dup exists → zFin: ${name}`);
        await safeMove(jobId, path.join(zipDir, name), path.join(doneDir, name));
        continue;
      }
    }

    // setERReplace で全角整理
    const conv = setERReplace(name);
    const convFull = path.join(zipDir, conv);
    if (conv !== name) {
      appendLog(jobId, `[Part1] rename (cleanup): ${name} → ${conv}`);
      try {
        await fs.rename(path.join(zipDir, name), convFull);
      } catch (e: any) {
        appendLog(jobId, `[Part1] rename 失敗: ${e.message}`);
        continue;
      }
      name = conv;
    }

    // 解凍先: UNZIP_DEST_DIR/<baseName>
    const baseName = name.replace(/\.(rar|zip|cbz|cbr|7z)$/i, "");
    const extractTo = path.join(unzipDir, baseName);
    await fs.mkdir(extractTo, { recursive: true });

    // 解凍コマンド
    //   1) 7z x を最優先 (zip/7z はもちろん、p7zip-full は RAR3 まで対応 / ファイル名 UTF-8 OK)
    //   2) 失敗時 unrar-free にフォールバック
    //   ※ unrar-free は非ASCII ファイル名で
    //     "Pathname cannot be converted from UTF-16BE to current locale" を吐くため
    //     ER のように長い英字+記号タイトルでは 7z を優先する
    const ext = path.extname(name).toLowerCase();
    const archivePath = path.join(zipDir, name);
    let cmd = await runCmd("7z", ["x", "-y", `-o${extractTo}`, archivePath]);
    if (cmd.code !== 0 && (ext === ".rar" || ext === ".cbr")) {
      appendLog(jobId, `[Part1] 7z 失敗、unrar-free でリトライ`);
      cmd = await runCmd("unrar-free", ["-x", archivePath, extractTo]);
    }
    for (const line of cmd.logs.slice(-30)) appendLog(jobId, `  ${line}`);
    if (cmd.code !== 0) {
      appendLog(jobId, `[Part1] [error] 解凍失敗 code=${cmd.code}: ${name}`);
      continue;
    }
    appendLog(jobId, `[Part1] 解凍OK: ${name}`);

    // 元アーカイブを ARCHIVE_DONE_DIR に移動
    let archiveDst = path.join(doneDir, name);
    if (await exists(archiveDst)) {
      const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      archiveDst = path.join(doneDir, `${baseName}__${stamp}${ext}`);
    }
    await fs.mkdir(doneDir, { recursive: true });
    if (await safeMove(jobId, archivePath, archiveDst)) {
      appendLog(jobId, `[Part1] archive → ${archiveDst}`);
    }
  }
}

// ========== Part 2: Unzip → ER_DEST_DIR (フォルダ整理) ==========

interface ParsedERName {
  enName: string;
  jpName: string;
  enTitle: string;
  jpTitle: string;
  /** 再構築されたフォルダ名 "[JpName] JpTitle - [EnName] EnTitle" */
  newName: string;
  /** 著者複合キー "EnName;JpName" */
  authorKey: string;
  /** initial: EnName 先頭1文字を大文字 */
  initial: string;
}

/** 文字列に日本語 (Hiragana/Katakana/CJK) を含むか */
function hasJapanese(s: string): boolean {
  return /[぀-ヿ㐀-䶿一-鿿ｦ-ﾟ]/.test(s);
}

/**
 * 解凍直後のフォルダ名を分解する。
 *
 * 実データの形式 (旧PHP 10_ER_unarchive.php が処理しているもの):
 *
 *   "[EnAuthor] EnTitle [Digital] [JpAuthor] JpTitle [DL版]"
 *
 * すなわち:
 *   - `[Digital]` `[DL版]` などのタグが間に混在する
 *   - 2 ブラケット形式 (英 + 日) が一般的
 *   - EnTitle 中に " - " ハイフンが含まれ得る (Title1 - Title2 のように)
 *   - 英/日 の順序は入れ替わる可能性あり (判定で吸収)
 *
 * 例:
 *   "[Ameyama Denshin] Anneliese no Takarabako - Anneliese's Treasure Chest [Digital] [雨山電信] あんねりーぜのたからばこ [DL版]"
 *   → enName="AmeyamaDenshin", jpName="雨山電信",
 *     enTitle="Anneliese no Takarabako - Anneliese's Treasure Chest",
 *     jpTitle="あんねりーぜのたからばこ"
 *   → newName="[雨山電信] あんねりーぜのたからばこ - [AmeyamaDenshin] Anneliese no Takarabako - Anneliese's Treasure Chest"
 *   → authorKey="AmeyamaDenshin;雨山電信"  initial="A"
 *
 * 失敗時 null。
 */
function parseERFolderName(raw: string): ParsedERName | null {
  // 1) ノイズタグ除去
  let s = raw
    .replace(/\[DL版\]/g, "")
    .replace(/\[Digital\]/gi, "")
    .replace(/\(完\)/g, "");
  s = s.replace(/\s+/g, " ").trim();

  // 2) "[…] T …[…] T" 2-bracket 形式を非貪欲マッチで分解
  //    A1 = 第1ブラケット中身, T1 = それに続く本文, A2 = 第2ブラケット中身, T2 = 残り
  const two = s.match(/^\[([^\]]+)\]\s*(.+?)\s*\[([^\]]+)\]\s*(.+)$/);
  if (two) {
    const a1 = two[1].trim();
    // 末尾の " - " など、ブラケット間の区切り記号は除去
    const t1 = two[2].trim().replace(/[\s-]+$/, "").trim();
    const a2 = two[3].trim();
    const t2 = two[4].trim();

    // 英 / 日 を文字種で振り分け
    //   原則: 日本語を含む方が JP、ASCII オンリーは EN
    const a1IsJp = hasJapanese(a1);
    const a2IsJp = hasJapanese(a2);
    let enName: string;
    let jpName: string;
    let enTitle: string;
    let jpTitle: string;
    if (!a1IsJp && a2IsJp) {
      enName = a1;
      enTitle = t1;
      jpName = a2;
      jpTitle = t2;
    } else if (a1IsJp && !a2IsJp) {
      jpName = a1;
      jpTitle = t1;
      enName = a2;
      enTitle = t2;
    } else if (!a1IsJp && !a2IsJp) {
      // 両方 ASCII → 第1を EN とする (フォルダのほぼ全体が英字の同人誌想定)
      enName = a1;
      enTitle = t1;
      jpName = a2;
      jpTitle = t2;
    } else {
      // 両方 JP → 第1を JP とする
      jpName = a1;
      jpTitle = t1;
      enName = a2;
      enTitle = t2;
    }

    const enNameNoSp = enName.replace(/\s+/g, "");
    const newName = `[${jpName}] ${jpTitle} - [${enNameNoSp}] ${enTitle}`;
    const authorKey = `${enNameNoSp};${jpName}`;
    const initial = (enNameNoSp.charAt(0) || "0").toUpperCase();
    return {
      enName: enNameNoSp,
      jpName,
      enTitle,
      jpTitle,
      newName,
      authorKey,
      initial,
    };
  }

  // 3) 1-bracket 形式: "[Author] ...title..." (日/英 が判別できない時のフォールバック)
  const one = s.match(/^\[([^\]]+)\]\s+(.+)$/);
  if (one) {
    const author = one[1].trim();
    const titlePart = one[2].trim();
    let jpTitle = titlePart;
    let enTitle = titlePart;
    const dashSplit = titlePart.split(/\s+-\s+/);
    if (dashSplit.length >= 2) {
      jpTitle = dashSplit[0].trim();
      enTitle = dashSplit.slice(1).join(" - ").trim();
    }
    const enNameNoSp = author.replace(/\s+/g, "");
    const jpName = author;
    const newName = `[${jpName}] ${jpTitle} - [${enNameNoSp}] ${enTitle}`;
    const authorKey = `${enNameNoSp};${jpName}`;
    const initial = (enNameNoSp.charAt(0) || "0").toUpperCase();
    return {
      enName: enNameNoSp,
      jpName,
      enTitle,
      jpTitle,
      newName,
      authorKey,
      initial,
    };
  }

  return null;
}

async function organizePhase(jobId: string, unzipDir: string, erDest: string) {
  appendLog(jobId, `[Part2] scan: ${unzipDir} → ${erDest}`);
  let wrappers: string[];
  try {
    wrappers = await fs.readdir(unzipDir);
  } catch (e: any) {
    appendLog(jobId, `[Part2] readdir 失敗: ${e.message}`);
    return;
  }
  for (const wrapper of wrappers) {
    if (/^\.|^@eaDir$|^DS_|^Thumbs\.db$/.test(wrapper)) continue;
    const wrapperFull = path.join(unzipDir, wrapper);
    const wrapperStat = await fs.stat(wrapperFull).catch(() => null);
    if (!wrapperStat?.isDirectory()) continue;

    // 直下が画像で wrapper 自体が authorTitle のパターン (1段) も許容
    let inners: string[];
    try {
      inners = await fs.readdir(wrapperFull);
    } catch {
      continue;
    }
    // 内側にディレクトリが含まれるかチェック
    const innerDirs: string[] = [];
    for (const n of inners) {
      if (/^\.|^@eaDir$|^DS_|^Thumbs\.db$/.test(n)) continue;
      const p = path.join(wrapperFull, n);
      const st = await fs.stat(p).catch(() => null);
      if (st?.isDirectory()) innerDirs.push(n);
    }

    if (innerDirs.length === 0) {
      // wrapper 自身を authorTitle と見なして処理
      await placeOne(jobId, wrapper, wrapperFull, erDest, "wrapper-as-title");
    } else {
      for (const authorTitle of innerDirs) {
        const authorTitleFull = path.join(wrapperFull, authorTitle);
        await placeOne(jobId, authorTitle, authorTitleFull, erDest, "wrapper-inner");
      }
      // wrapper を片付け (空なら削除)
      try {
        const remain = await fs.readdir(wrapperFull);
        const visible = remain.filter((n) => !/^\.|^@eaDir$|^DS_|^Thumbs\.db$/.test(n));
        if (visible.length === 0) {
          await fs.rm(wrapperFull, { recursive: true, force: true });
          appendLog(jobId, `[Part2] wrapper 削除: ${wrapperFull}`);
        }
      } catch {
        /* ignore */
      }
    }
  }
}

async function placeOne(
  jobId: string,
  folderName: string,
  srcFull: string,
  erDest: string,
  layout: string
) {
  const parsed = parseERFolderName(folderName);
  if (!parsed) {
    appendLog(
      jobId,
      `[Part2] パース失敗 (${layout}): ${folderName} ※ "[JpName] JpTitle - [EnName] EnTitle" 形式でない`
    );
    return;
  }
  const { initial, authorKey, newName } = parsed;
  const dstAuthorDir = path.join(erDest, initial, authorKey);
  const dstFinal = path.join(dstAuthorDir, newName);
  await fs.mkdir(dstAuthorDir, { recursive: true });
  if (await exists(dstFinal)) {
    appendLog(jobId, `[Part2] [warn] 既存あり: ${dstFinal} (スキップ)`);
    return;
  }
  if (await safeMove(jobId, srcFull, dstFinal)) {
    appendLog(jobId, `[Part2] OK: ${srcFull} → ${dstFinal}`);
  }
}

// ========== エントリポイント ==========

export function startExtractErComic(): JobState {
  return runJobAsync("extractErComic", async (jobId) => {
    const zipDir = process.env.EXTRACT_ER_ARCHIVE_DIR || process.env.EXTRACT_ARCHIVE_DIR;
    const unzipDir = process.env.UNZIP_DEST_DIR_ER || process.env.UNZIP_DEST_DIR;
    const doneDir = process.env.ARCHIVE_DONE_DIR_ER || process.env.ARCHIVE_DONE_DIR;
    const erDest = process.env.ER_DEST_DIR;

    if (!zipDir) throw new Error("EXTRACT_ER_ARCHIVE_DIR が設定されていません");
    if (!unzipDir) throw new Error("UNZIP_DEST_DIR(_ER) が設定されていません");
    if (!doneDir) throw new Error("ARCHIVE_DONE_DIR(_ER) が設定されていません");
    if (!erDest) throw new Error("ER_DEST_DIR が設定されていません (例: /erc/uDownloading)");

    appendLog(jobId, `zipDir:  ${zipDir}`);
    appendLog(jobId, `unzipDir:${unzipDir}`);
    appendLog(jobId, `doneDir: ${doneDir}`);
    appendLog(jobId, `erDest:  ${erDest}`);

    await fs.mkdir(unzipDir, { recursive: true });
    await fs.mkdir(doneDir, { recursive: true });
    await fs.mkdir(erDest, { recursive: true });

    // Part 1
    await extractPhase(jobId, zipDir, unzipDir, doneDir);
    // Part 2
    await organizePhase(jobId, unzipDir, erDest);

    return {
      message: "ERComic 解凍ジョブ完了",
      outputs: [erDest],
    };
  });
}
