import { useMemo, useState } from "react";
import { useMutation } from "@apollo/client";
import { CRAWL_13DL_LIST, MAKE_REGIST_DIR } from "@/gql/operations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";

/**
 * 13dl カテゴリ クロール画面（旧PHP /V_SearchPage 後継）
 *
 * 旧PHPロジック (read_html.php → read_feed_comic_returnjson2.php → read_feed_detail.php) を移植:
 *  - https://13dl.me/category/raw-manga/?p=N でカテゴリ取得
 *  - 各アイテムの title から JP/EN を分解
 *  - 詳細ページから RapidGator のファイル名/URLを抽出
 *  - DB を検索して既存(existDir) or 新規(newDir) のフォルダパスを返す
 *
 * UI側では:
 *  - ExistDir / NEW Dir ボタンで makeRegistDir mutation を叩いて
 *    REGIST_DIR 配下に対応フォルダを作成する
 */
const DEFAULT_BASE = "https://13dl.me/category/raw-manga/";
const CHUNK_SIZE = 8;
const MAX_CHUNKS = 10;

interface RGLink {
  fileName: string;
  url: string;
}
interface Item {
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

export function SearchPagePage() {
  const [baseUrl, setBaseUrl] = useState(DEFAULT_BASE);
  const [chunkNo, setChunkNo] = useState(0);
  const [runCrawl, crawlState] = useMutation(CRAWL_13DL_LIST);
  const [doMake] = useMutation(MAKE_REGIST_DIR);
  const [actionMsg, setActionMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const result = crawlState.data?.crawl13dlList;
  const items: Item[] = useMemo(() => (result?.items as Item[]) ?? [], [result]);

  const chunkOptions = useMemo(
    () =>
      Array.from({ length: MAX_CHUNKS }, (_, i) => ({
        value: i,
        label: `Page${i + 1}`,
      })),
    []
  );

  const runFetch = () => {
    setActionMsg(null);
    runCrawl({ variables: { categoryUrl: baseUrl, chunkNo, chunkSize: CHUNK_SIZE } });
  };

  const onMakeDir = async (dir: string) => {
    if (!dir) return;
    const { data } = await doMake({ variables: { dir } });
    setActionMsg(
      data?.makeRegistDir
        ? { ok: data.makeRegistDir.ok, text: data.makeRegistDir.message }
        : { ok: false, text: "API応答なし" }
    );
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Page 取得 (13dl.me)</h2>

      <Card className="p-4 space-y-3">
        <div className="text-sm font-medium">カテゴリ URL</div>
        <Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm">ページ:</label>
          <select
            value={chunkNo}
            onChange={(e) => setChunkNo(Number(e.target.value))}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          >
            {chunkOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <Button onClick={runFetch} disabled={crawlState.loading}>
            {crawlState.loading ? "取得中…" : "CrawlReadHTML"}
          </Button>
          {result && (
            <span className="text-xs text-muted-foreground tabular-nums ml-auto">
              {result.totalItems} 件 / {result.elapsedSec.toFixed(2)}s
            </span>
          )}
        </div>

        {actionMsg && (
          <div
            className={
              "text-sm rounded border p-2 " +
              (actionMsg.ok
                ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                : "border-red-300 bg-red-50 text-red-800")
            }
          >
            {actionMsg.text}
          </div>
        )}

        {result && (
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer">
              クロールログ ({result.logs.length}行)
            </summary>
            <pre className="mt-1 max-h-64 overflow-auto bg-background border rounded p-2 whitespace-pre-wrap">
              {result.logs.join("\n")}
            </pre>
          </details>
        )}
      </Card>

      <div className="space-y-3">
        {items.map((it, idx) => (
          <Card key={idx} className="p-3 space-y-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold">
                  <a
                    href={it.detailUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary hover:underline"
                  >
                    {it.title}
                  </a>
                </div>
                <div className="text-xs text-muted-foreground">
                  JP: {it.titleJa}　/　EN: {it.titleEn}
                </div>
                {it.stock && (
                  <div className="text-xs text-amber-700">
                    stock: {it.stock.replace(/,$/, "")}
                  </div>
                )}
              </div>
              <div className="flex flex-wrap gap-1">
                {it.existDir && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onMakeDir(it.existDir!)}
                    title={it.existDir}
                  >
                    ExistDir
                  </Button>
                )}
                {it.newDir && (
                  <Button size="sm" onClick={() => onMakeDir(it.newDir!)} title={it.newDir}>
                    NEW Dir
                  </Button>
                )}
              </div>
            </div>

            {/* 作成予定パスを表示 */}
            {(it.existDir || it.newDir) && (
              <div className="text-xs font-mono break-all text-muted-foreground">
                → {it.existDir ?? it.newDir}
              </div>
            )}

            {it.rapidGatorLinks.length > 0 ? (
              <ul className="text-xs space-y-0.5">
                {it.rapidGatorLinks.map((l, i) => (
                  <li key={i} className="font-mono break-all">
                    <a
                      href={l.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary hover:underline"
                    >
                      {l.fileName}
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="text-xs text-muted-foreground">RapidGator リンクなし</div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
