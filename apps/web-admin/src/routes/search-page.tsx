import { useMemo, useState } from "react";
import { useMutation } from "@apollo/client";
import { CRAWL_13DL_LIST, MAKE_REGIST_DIR } from "@/gql/operations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";

/**
 * 13dl カテゴリ クロール画面（旧PHP /V_SearchPage 後継）
 *
 * 仕様:
 *   - 1ページあたり 24 タイトル
 *   - 24件一気にクロールすると重い → 3チャンクに分けて指定:
 *       Page:1-7 / Page:8-15 / Page:16-24
 *   - pageNum も切り替え可能（Page数だけ別selectorで進める）
 */
const DEFAULT_BASE = "https://13dl.me/category/raw-manga/";

interface ChunkOption {
  label: string;
  startIdx: number;
  endIdx: number;
}
const CHUNKS: ChunkOption[] = [
  { label: "Page:1-7", startIdx: 1, endIdx: 7 },
  { label: "Page:8-15", startIdx: 8, endIdx: 15 },
  { label: "Page:16-24", startIdx: 16, endIdx: 24 },
];

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
  const [pageNum, setPageNum] = useState(1);
  const [chunkIdx, setChunkIdx] = useState(0); // CHUNKS のインデックス
  const [runCrawl, crawlState] = useMutation(CRAWL_13DL_LIST);
  const [doMake] = useMutation(MAKE_REGIST_DIR);
  const [actionMsg, setActionMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const result = crawlState.data?.crawl13dlList;
  const items: Item[] = useMemo(() => (result?.items as Item[]) ?? [], [result]);

  const runFetch = () => {
    setActionMsg(null);
    const chunk = CHUNKS[chunkIdx];
    runCrawl({
      variables: {
        categoryUrl: baseUrl,
        pageNum,
        startIdx: chunk.startIdx,
        endIdx: chunk.endIdx,
      },
    });
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
          <label className="text-sm">ページ番号:</label>
          <Input
            type="number"
            min={1}
            value={pageNum}
            onChange={(e) => setPageNum(Math.max(1, Number(e.target.value) || 1))}
            className="w-20"
          />
          <label className="text-sm">範囲:</label>
          <select
            value={chunkIdx}
            onChange={(e) => setChunkIdx(Number(e.target.value))}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          >
            {CHUNKS.map((c, i) => (
              <option key={i} value={i}>
                {c.label}
              </option>
            ))}
          </select>
          <Button onClick={runFetch} disabled={crawlState.loading}>
            {crawlState.loading ? "取得中…" : "CrawlReadHTML"}
          </Button>
          {result && (
            <span className="text-xs text-muted-foreground tabular-nums ml-auto">
              p{result.pageNum} {result.startIdx}-{result.endIdx}: {result.totalItems} 件 /{" "}
              {result.elapsedSec.toFixed(2)}s
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
