import axios from "axios";
import * as cheerio from "cheerio";
import { elapsed } from "./runtime.js";
import { prisma } from "../db.js";

/**
 * 13dl.me のカテゴリページから item を取得し、各 item の詳細ページから
 * RapidGator リンクを抽出する。さらに tb_bok を検索して
 *   - 既存ならその作品の existDir パスを返す  ( /<vch0>/[<vch1>] <vch3>;<vch7>/ )
 *   - 新規なら newDir パスを返す                ( /0/[Unknown;Unknown] <EN>;<JP> )
 *
 * 旧 PHP /crawl13dl/read_html.php + read_feed_comic_returnjson2.php + read_feed_detail.php を移植。
 *
 * pageInfo 形式: "page-startIdx-endIdx" (1-indexed, end含む)
 *   "1-1-8"  = page1 の 1〜8番目
 *   "1-9-16" = page1 の 9〜16番目
 *   "2-1-8"  = page2 の 1〜8番目  など
 */
const DEFAULT_BASE = process.env.CRAWL13DL_BASE_URL ?? "https://13dl.me/category/raw-manga/";
const UA =
  process.env.CRAWL13DL_USER_AGENT ??
  "Mozilla/5.0 (zcomic-admin-bot; +internal-tool) AppleWebKit/537.36";

export interface RGLink {
  fileName: string;
  url: string;
}
export interface CrawledItem {
  title: string;
  titleJa: string;
  titleEn: string;
  detailUrl: string;
  stock: string;
  foundNo: string;
  newDir: string | null;
  existDir: string | null;
  rapidGatorLinks: RGLink[];
}
export interface CrawlListResult {
  ok: boolean;
  baseUrl: string;
  pageUrl: string;
  pageNum: number;
  startIdx: number;
  endIdx: number;
  totalItems: number;
  items: CrawledItem[];
  elapsedSec: number;
  logs: string[];
}

async function httpGet(url: string): Promise<{ data: string; ok: boolean; err?: string }> {
  try {
    const res = await axios.get(url, {
      headers: { "User-Agent": UA, "Accept-Language": "ja,en;q=0.9" },
      timeout: 30000,
      maxRedirects: 5,
      responseType: "text",
    });
    return { data: typeof res.data === "string" ? res.data : String(res.data), ok: true };
  } catch (e: any) {
    return { data: "", ok: false, err: e.message };
  }
}

/** タイトルの全角化（旧PHPに合わせる） */
function normalizeTitle(t: string): string {
  return t
    .replace(/ raw/gi, "")
    .replace(/raw/gi, "")
    .replace(/!/g, "！")
    .replace(/\?/g, "？")
    .replace(/:/g, "：")
    .replace(/@/g, "＠")
    .trim();
}

/**
 * タイトルから JP / EN を抽出。
 *   元PHP:
 *     $title1 = preg_split("/第\d.*巻|第\d.*話/",$title);
 *     $titleJP = $title1[0];
 *     $titleJP3 = explode("～",$titleJP2[0]);
 *     ...
 *     $titleEN = trim($title1[1]); 角括弧外し → "vol NN-NN|vol NN" でsplit → 先頭が英字タイトル
 */
function splitTitle(rawTitle: string): { titleJa: string; titleEn: string } {
  const title = normalizeTitle(rawTitle);
  // 「第N巻」「第N話」で分割
  const parts = title.split(/第\d[^\s\]]*?巻|第\d[^\s\]]*?話/);
  let titleJa = (parts[0] ?? title).trim();
  // ～(wavedash) 以降は捨てる
  titleJa = titleJa.split(/[〜～]/)[0].trim();

  let titleEn = "";
  if (parts.length > 1 && parts[1]) {
    let en = parts[1].trim().replace(/[\[\]]/g, "");
    const enParts = en.split(/vol\s*\d+-\d+|vol\s*\d+/i);
    titleEn = (enParts[0] ?? "").trim();
  }
  if (!titleEn) titleEn = titleJa; // 英字なし → JPで埋める
  return { titleJa, titleEn };
}

/** 詳細ページから RapidGator リンクを抽出 */
function extractRapidGatorLinks(html: string): RGLink[] {
  const $ = cheerio.load(html);
  const out: RGLink[] = [];
  const seen = new Set<string>();
  // 元PHPの XPath 相当: body > div[2] > div > article > div > div[1] > section > table > tbody > tr
  // 緩めに section table tr で拾い、td[0]=filename, td[1] span a でURL
  $("section table tbody tr").each((_, tr) => {
    const $tr = $(tr);
    const tds = $tr.find("td");
    if (tds.length < 2) return;
    const fileName = $(tds[0]).text().trim();
    // 1つ目の span 内の a を狙う（PHP は span[0]->a を見ている）
    let url = $(tds[1]).find("span a[href]").first().attr("href") || "";
    if (!url) url = $(tds[1]).find("a[href]").first().attr("href") || "";
    if (!url || !fileName) return;
    // RapidGator 以外も含む可能性があるので、ファイル名にrar/zip等が含まれるものに絞る
    if (!/\.(rar|zip|7z|cbz|cbr)/i.test(fileName)) return;
    if (seen.has(url)) return;
    seen.add(url);
    out.push({ fileName, url });
  });
  // フォールバック: section テーブルが取れない場合、a[href*=rapidgator] を全部拾う
  if (out.length === 0) {
    $("a[href*='rapidgator']").each((_, a) => {
      const url = $(a).attr("href")!;
      if (seen.has(url)) return;
      seen.add(url);
      let fileName = $(a).text().trim();
      if (!/\.(rar|zip|7z|cbz|cbr)/i.test(fileName)) {
        const m = /([^/]+\.(?:rar|zip|7z|cbz|cbr))/i.exec(decodeURIComponent(url));
        if (m) fileName = m[1];
      }
      if (!fileName) fileName = url;
      out.push({ fileName, url });
    });
  }
  return out;
}

/**
 * tb_bok を 日本語タイトルで部分一致検索 (旧 getBookFromTxtArr の代替)。
 * 1件以上見つかれば既存扱い、最初の1行から authorJa, titleJa, topFolder, vch3 を取って existDir を組み立てる。
 * 見つからなければ newDir を組み立てる。
 */
async function lookupDirPaths(titleJa: string, titleEn: string): Promise<{
  stock: string;
  foundNo: string;
  newDir: string | null;
  existDir: string | null;
}> {
  let dats: any[] = [];
  if (titleJa) {
    try {
      dats = await prisma.volume.findMany({
        where: {
          deletedAt: null,
          titleJa: { contains: titleJa },
        },
        orderBy: { id: "asc" },
        take: 50,
      });
    } catch {
      dats = [];
    }
  }
  if (dats.length === 0) {
    // newDir
    const en =
      titleEn && titleEn !== titleJa
        ? titleEn.slice(0, 40).trim()
        : titleJa
          ? "NoEnglishTitle"
          : "NoEnglishTitle";
    const dir = `/0/[Unknown;Unknown] ${en};${titleJa}`;
    return { stock: "", foundNo: "", newDir: dir, existDir: null };
  }
  const stock = dats.map((d) => d.noJa || d.no || "").filter(Boolean).join(",") + ",";
  const d0 = dats[0];
  // existDir = /<vch0>/[<vch1>] <vch3>;<vch7>/
  const vch0 = d0.topFolder || "0";
  const vch1 = d0.authorJa1 || `${d0.authorEn ?? "Unknown"};${d0.authorJa ?? "Unknown"}`;
  const vch3 = d0.titleEn || titleEn || titleJa;
  const vch7 = d0.titleJa || titleJa;
  const existDir = `/${vch0}/[${vch1}] ${vch3};${vch7}/`;
  return { stock, foundNo: stock, newDir: null, existDir };
}

/**
 * カテゴリページ全体から item の (title, href) を抽出。
 *
 * 旧PHPの DOM: body > div[2] > div[2] > div > div[0] > div[i] > div > a
 * 全体に「div > a[href][title]」が item 候補。
 */
function listCategoryItems(html: string, log: string[]): { title: string; href: string }[] {
  const $ = cheerio.load(html);
  const seen = new Set<string>();
  const result: { title: string; href: string }[] = [];
  $("a[href][title]").each((_, a) => {
    const href = $(a).attr("href") || "";
    const title = $(a).attr("title") || "";
    if (!href || !title) return;
    // /category や /tag は除外
    if (!/^https?:\/\//.test(href)) return;
    if (/\/category\/|\/tag\/|\/page\//.test(href)) return;
    if (seen.has(href)) return;
    seen.add(href);
    result.push({ title, href });
  });
  log.push(`  parsed ${result.length} item candidates`);
  return result;
}

/**
 * pageInfo "page-start-end" 相当の指定でクロール。
 *   pageNum  = 1始まり、カテゴリの p=N
 *   startIdx = 1始まり、ページ内 1〜24 のうち取得開始
 *   endIdx   = 1始まり、ページ内 1〜24 のうち取得終了（含む）
 *
 * 例:
 *   (1, 1, 7)   → ?p=1 の 1〜7番目
 *   (1, 8, 15)  → ?p=1 の 8〜15番目
 *   (1, 16, 24) → ?p=1 の 16〜24番目
 *   (2, 1, 7)   → ?p=2 の 1〜7番目
 *
 * 1ページ最大24件 (13dl の通常表示)。範囲を超えた場合は安全にクリップ。
 */
export async function crawl13dlList(
  categoryUrl: string | null | undefined,
  pageNum: number,
  startIdx: number,
  endIdx: number
): Promise<CrawlListResult> {
  const start = Date.now();
  const log: string[] = [];
  const base = categoryUrl?.trim() || DEFAULT_BASE;
  const safePage = Math.max(1, pageNum | 0);
  const safeStart = Math.max(1, startIdx | 0);
  const safeEnd = Math.max(safeStart, endIdx | 0);

  // 旧PHPは ?p=N
  const pageUrl = `${base.replace(/\/+$/, "")}/?p=${safePage}`;
  log.push(`fetch: ${pageUrl}  range=${safeStart}-${safeEnd}`);
  const r = await httpGet(pageUrl);
  if (!r.ok) {
    return {
      ok: false,
      baseUrl: base,
      pageUrl,
      pageNum: safePage,
      startIdx: safeStart,
      endIdx: safeEnd,
      totalItems: 0,
      items: [],
      elapsedSec: elapsed(start),
      logs: [...log, `[error] ${r.err}`],
    };
  }
  const candidates = listCategoryItems(r.data, log);
  // 1始まりの範囲を 0始まりの配列スライスに変換
  const sliced = candidates.slice(safeStart - 1, safeEnd);
  log.push(`  slice ${safeStart}..${safeEnd} → ${sliced.length} item(s)`);

  const items: CrawledItem[] = [];
  for (let i = 0; i < sliced.length; i++) {
    const { title, href } = sliced[i];
    const idxLabel = safeStart + i;
    log.push(`[${idxLabel}] ${title}`);
    if (/\[Novel\]/i.test(title)) {
      log.push(`  skip (Novel)`);
      continue;
    }
    const split = splitTitle(title);
    log.push(`  titleJa="${split.titleJa}"  titleEn="${split.titleEn}"`);
    const detailR = await httpGet(href);
    let rgLinks: RGLink[] = [];
    if (detailR.ok) {
      rgLinks = extractRapidGatorLinks(detailR.data);
      log.push(`  RG links: ${rgLinks.length}`);
    } else {
      log.push(`  [error] detail fetch: ${detailR.err}`);
    }
    const dirs = await lookupDirPaths(split.titleJa, split.titleEn);
    log.push(`  ${dirs.existDir ? "existDir" : "newDir"}=${dirs.existDir ?? dirs.newDir}`);

    items.push({
      title: normalizeTitle(title),
      titleJa: split.titleJa,
      titleEn: split.titleEn,
      detailUrl: href,
      stock: dirs.stock,
      foundNo: dirs.foundNo,
      newDir: dirs.newDir,
      existDir: dirs.existDir,
      rapidGatorLinks: rgLinks,
    });
  }

  return {
    ok: true,
    baseUrl: base,
    pageUrl,
    pageNum: safePage,
    startIdx: safeStart,
    endIdx: safeEnd,
    totalItems: items.length,
    items,
    elapsedSec: elapsed(start),
    logs: log,
  };
}

// 単一URL用（後方互換）
export async function crawl13dl(url: string) {
  const start = Date.now();
  const logs: string[] = [`crawl: ${url}`];
  const r = await httpGet(url);
  if (!r.ok) {
    return { ok: false, url, elapsedSec: elapsed(start), pages: [], logs: [...logs, r.err || ""] };
  }
  const rg = extractRapidGatorLinks(r.data);
  return {
    ok: true,
    url,
    elapsedSec: elapsed(start),
    pages: rg.map((l) => ({ title: l.fileName, url, downloadUrl: l.url, thumbnailUrl: null })),
    logs,
  };
}
