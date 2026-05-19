import axios from "axios";
import * as cheerio from "cheerio";

/**
 * 旧 PHP /crawlMangaOukoku/read_html.php + read_feed_comic_returnjson2.php の代替。
 *
 * マンガ王国 (https://comic.k-manga.jp) から日本語キーワードで検索し、候補を返す。
 *
 * 旧URL : https://comic.k-manga.jp/search/word/<keyword>
 *
 * ※ 旧PHPは UA 未設定の curl で取得していた。Chrome 系の UA を付けると k-manga 側で
 *   JS-rendered な SPA stub HTML (≈2.5KB) を返してくる事象が確認されたため、
 *   本実装でも UA は明示的に空 (=axios のデフォルト "axios/x.x.x" のまま) で送る。
 */
const BASE = "https://comic.k-manga.jp";
const SEARCH_URL = (kw: string) => `${BASE}/search/word/${encodeURIComponent(kw)}`;

export interface MKResult {
  sourceSite: string;
  titleJa: string;
  authorJa: string | null;
  url: string | null;
  coverUrl: string | null;
  description: string | null;
}

/** axios で k-manga.jp の HTML を取得 (UA 切替で 2 回試行) */
async function fetchKManga(url: string): Promise<{ ok: boolean; status: number; html: string; error?: string }> {
  // 1) UA なし (旧 PHP curl 相当)
  // 2) curl/7 系 UA (1 で stub が返った時のフォールバック)
  const attempts: Array<Record<string, string>> = [
    {
      // axios のデフォルト UA "axios/x.x.x" のまま
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
    {
      "User-Agent": "curl/7.81.0",
      Accept: "*/*",
    },
  ];
  let lastErr = "";
  for (const headers of attempts) {
    try {
      const res = await axios.get(url, {
        headers,
        timeout: 20000,
        maxRedirects: 5,
        validateStatus: () => true,
        // 旧PHP: CURLOPT_SSL_VERIFYPEER=false 相当
      });
      const html = typeof res.data === "string" ? res.data : String(res.data ?? "");
      if (res.status >= 400) {
        lastErr = `HTTP ${res.status}`;
        continue;
      }
      // /title/<id>/ の链接が1つでもあれば成功扱い
      if (/\/title\/\d+/.test(html)) {
        return { ok: true, status: res.status, html };
      }
      // SPA stub の可能性。HTML が極端に小さい場合は次の UA で再試行
      if (html.length < 5000) {
        lastErr = `stub ${html.length}B`;
        continue;
      }
      // ある程度サイズはあるが /title/ 链接が見つからない → 返却して上位で解析
      return { ok: true, status: res.status, html };
    } catch (e: any) {
      lastErr = e.message || "request failed";
      continue;
    }
  }
  return { ok: false, status: 0, html: "", error: lastErr };
}

export async function searchMangaKingdom(titleJa: string): Promise<MKResult[]> {
  const url = SEARCH_URL(titleJa);
  const fetched = await fetchKManga(url);
  if (!fetched.ok) {
    return [
      {
        sourceSite: "マンガ王国",
        titleJa: `(error) ${fetched.error}`,
        authorJa: null,
        url,
        coverUrl: null,
        description: fetched.error || null,
      },
    ];
  }

  const html = fetched.html;
  const $ = cheerio.load(html);
  const seen = new Set<string>();
  const candidates: MKResult[] = [];

  // 1) 主要候補: a[href] のうち /title/<id> を含むものを起点
  $("a[href]").each((_, a) => {
    const $a = $(a);
    const href = ($a.attr("href") || "").trim();
    const m = /\/title\/(\d+)(?:\/|$)/.exec(href);
    if (!m) return;
    const url = new URL(href, BASE).toString();
    if (seen.has(url)) return;

    // タイトル取得
    let title = $a.find("h2, h3, .bookTtl, .title, .ttl").first().text().trim();
    if (!title) title = ($a.find("img").first().attr("alt") || "").trim();
    if (!title) title = $a.text().trim();
    if (!title) return;
    // タイトルが長すぎる(=フッターなど誤検出)場合スキップ
    if (title.length > 200) return;

    // 著者
    const authors: string[] = [];
    $a.find("p span, .author span, .bookAuthor, .author").each((_, sp) => {
      const t = $(sp).text().trim();
      if (t && t !== title) authors.push(t);
    });
    if (authors.length === 0) {
      const $li = $a.closest("li");
      if ($li.length) {
        $li.find("p span, .author span, .author, .bookAuthor").each((_, sp) => {
          const t = $(sp).text().trim();
          if (t && t !== title) authors.push(t);
        });
      }
    }

    const $img = $a.find("img").first();
    const cover =
      $img.attr("src") ||
      $img.attr("data-src") ||
      $img.attr("data-original") ||
      null;

    seen.add(url);
    candidates.push({
      sourceSite: "マンガ王国",
      titleJa: title,
      authorJa: authors.length ? Array.from(new Set(authors)).join(",") : null,
      url,
      coverUrl: cover,
      description: null,
    });
  });

  // 2) フォールバック: HTML 全文を正規表現で走査
  //    /title/<id>/pv リンクと、その前後にある h2/p span から
  //    タイトル/著者を抽出する。SPAでない時の旧 k-manga 構造想定。
  if (candidates.length === 0) {
    // <a href="/title/{id}/pv"...>...</a> ブロックを切り出す
    const reBlock =
      /<a[^>]+href="(\/title\/\d+\/pv)"[^>]*>([\s\S]*?)<\/a>/gi;
    let mm: RegExpExecArray | null;
    while ((mm = reBlock.exec(html))) {
      const href = mm[1];
      const inner = mm[2];
      const url = new URL(href, BASE).toString();
      if (seen.has(url)) continue;
      const h2 = /<h2[^>]*>([\s\S]*?)<\/h2>/i.exec(inner)?.[1] ?? "";
      const title = stripTags(h2).trim();
      if (!title) continue;
      const authors: string[] = [];
      const reSpan = /<span[^>]*>([\s\S]*?)<\/span>/gi;
      let sm: RegExpExecArray | null;
      while ((sm = reSpan.exec(inner))) {
        const t = stripTags(sm[1]).trim();
        if (t && t !== title) authors.push(t);
      }
      const cover =
        /<img[^>]+(?:data-src|data-original|src)="([^"]+)"/i.exec(inner)?.[1] ?? null;
      seen.add(url);
      candidates.push({
        sourceSite: "マンガ王国",
        titleJa: title,
        authorJa: authors.length ? Array.from(new Set(authors)).join(",") : null,
        url,
        coverUrl: cover,
        description: null,
      });
    }
  }

  if (candidates.length === 0) {
    return [
      {
        sourceSite: "マンガ王国",
        titleJa: "(no hits)",
        authorJa: null,
        url,
        coverUrl: null,
        description: `HTML received (${html.length} bytes). snippet: ${html
          .slice(0, 800)
          .replace(/\s+/g, " ")}`,
      },
    ];
  }

  return candidates.slice(0, 40);
}

function stripTags(s: string): string {
  return s.replace(/<[^>]*>/g, "");
}
