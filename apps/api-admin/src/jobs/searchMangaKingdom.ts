import axios from "axios";
import * as cheerio from "cheerio";

/**
 * マンガ王国 (https://comic.k-manga.jp) から titleJa で検索し、候補を返す。
 *
 * 注意: マンガ王国のページ構造は変わる可能性あり。
 * セレクタは _legacy_admin_php を参照して必要に応じて調整。
 */
export async function searchMangaKingdom(titleJa: string) {
  const q = encodeURIComponent(titleJa);
  const url = `https://comic.k-manga.jp/search?keyword=${q}`;
  try {
    const res = await axios.get(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (zcomic-admin-bot; +internal-tool) AppleWebKit/537.36",
      },
      timeout: 20000,
    });
    const $ = cheerio.load(res.data);
    const candidates: any[] = [];
    // 暫定セレクタ: ".search_item a" や ".bookList a" など、サイト構造に合わせて要調整
    $(".bookList li, .search_item, .work_item").each((_, el) => {
      const $el = $(el);
      const title = $el.find(".bookTtl, .title, h3").first().text().trim();
      const author = $el.find(".author, .bookAuthor").first().text().trim();
      const link = $el.find("a").first().attr("href");
      const cover = $el.find("img").first().attr("src");
      if (!title) return;
      candidates.push({
        sourceSite: "マンガ王国",
        titleJa: title,
        authorJa: author || null,
        url: link ? new URL(link, "https://comic.k-manga.jp").toString() : null,
        coverUrl: cover ?? null,
        description: null,
      });
    });
    return candidates.slice(0, 20);
  } catch (e: any) {
    return [
      {
        sourceSite: "マンガ王国",
        titleJa: `(error) ${e.message}`,
        authorJa: null,
        url: null,
        coverUrl: null,
        description: e.message,
      },
    ];
  }
}
