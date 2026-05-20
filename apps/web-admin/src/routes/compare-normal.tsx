import { useState } from "react";
import { useLazyQuery, useMutation } from "@apollo/client";
import {
  COMPARE_UNREGIST,
  EXCHANGE_DIR,
  DELETE_DB_AND_BOOK,
  RENAME_REGIST_FOLDER,
  START_REGIST_UNREGIST_ALL,
  START_REGIST_ER_UNREGIST_ALL,
} from "@/gql/operations";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { JobProgress } from "@/components/JobProgress";

/**
 * 比較標準 (V_CompareComic) 後継ページ。
 *
 * 旧PHP /admin_new/comparNo.php?mode=COMIC を踏襲。
 *
 * フロー:
 *   1. 「比較取得」 → REGIST_DIR 配下の葉フォルダ一覧を取得し、
 *      各エントリで tb_bok の既存巻 (stockBooks) を表示。
 *   2. 各エントリで:
 *        - 変更   : REGIST_DIR 配下の oldDir → newDir に rename
 *        - LinkPage: comic.k-manga.jp 検索リンクを別タブで開く
 *   3. stock の各巻 (StockBook) に対して:
 *        - 入換 : 既存の COMIC_ROOT/<stock.folderPath> を REGIST_DIR/<stock.folderPath> で
 *                 入換 (旧 exchangeDir.php)。新データ・イメージで置換。
 *        - 削除 : tb_bok の該当行 + COMIC_ROOT/<stock.folderPath> を削除
 *                 (旧 deleteDBandBook.php)
 *   4. 「NormalComic登録」 → startRegistUnregistAll 非同期ジョブ
 */
interface StockBook {
  id: number;
  no: string;
  folderPath: string;
}
interface CompareEntry {
  folderPath: string;
  authorHead: string;
  authorTitleFolder: string;
  authorJa: string;
  titleJa: string;
  volumeNo: string;
  stockVolumes: string[];
  stockBooks: StockBook[];
  stockCount: number;
  alreadyInDb: boolean;
  existingBokMid: number | null;
}

export function CompareNormalPage() {
  const [doCompare, compareState] = useLazyQuery(COMPARE_UNREGIST, {
    fetchPolicy: "network-only",
  });
  const [doExchange] = useMutation(EXCHANGE_DIR);
  const [doDelete] = useMutation(DELETE_DB_AND_BOOK);
  const [doRename] = useMutation(RENAME_REGIST_FOLDER);
  const [doRegist, registState] = useMutation(START_REGIST_UNREGIST_ALL);
  const [doRegistEr, registErState] = useMutation(START_REGIST_ER_UNREGIST_ALL);

  const [registJobId, setRegistJobId] = useState<string | null>(null);
  const [registErJobId, setRegistErJobId] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<{ ok: boolean; text: string } | null>(null);
  // stock 個別アクション完了済みをパスごとに灰色表示する
  const [doneStocks, setDoneStocks] = useState<Set<string>>(new Set());

  const result = compareState.data?.compareUnregist;
  const entries: CompareEntry[] = result?.entries ?? [];

  const markStockDone = (folderPath: string) => {
    setDoneStocks((s) => {
      const next = new Set(s);
      next.add(folderPath);
      return next;
    });
  };

  const onCompare = () => {
    setActionMsg(null);
    setDoneStocks(new Set());
    doCompare();
  };

  /** stock 1巻に対する入換: REGIST_DIR/<stock.folderPath> → COMIC_ROOT/<stock.folderPath> */
  const onExchangeStock = async (stock: StockBook) => {
    if (
      !window.confirm(
        `既存巻を新データで入換しますか？\n` +
          `REGIST_DIR${stock.folderPath}\n→ COMIC_ROOT${stock.folderPath}\n` +
          `(id=${stock.id}, no=${stock.no})`
      )
    ) {
      return;
    }
    const { data } = await doExchange({ variables: { newDir: stock.folderPath } });
    const r = data?.exchangeDir;
    setActionMsg(r ? { ok: r.ok, text: r.message } : { ok: false, text: "API応答なし" });
    if (r?.ok) markStockDone(stock.folderPath);
  };

  /** stock 1巻に対する削除: tb_bok 行 + COMIC_ROOT/<stock.folderPath> */
  const onDeleteStock = async (stock: StockBook) => {
    if (
      !window.confirm(
        `既存巻を削除しますか？\n${stock.folderPath}\n` +
          `(id=${stock.id}, no=${stock.no}) / tb_bok 行 + COMIC_ROOT のフォルダを削除`
      )
    ) {
      return;
    }
    const { data } = await doDelete({ variables: { bookPath: stock.folderPath } });
    const r = data?.deleteDBandBook;
    setActionMsg(r ? { ok: r.ok, text: r.message } : { ok: false, text: "API応答なし" });
    if (r?.ok) markStockDone(stock.folderPath);
  };

  const onRename = async (entry: CompareEntry) => {
    const newName = window.prompt(
      "新しい AuthorTitle フォルダ名（[En;JP] EnTitle;JPTitle）",
      entry.authorTitleFolder
    );
    if (!newName || newName === entry.authorTitleFolder) return;
    const oldDir = `/${entry.authorHead}/${entry.authorTitleFolder}`;
    const newDir = `/${entry.authorHead}/${newName}`;
    const { data } = await doRename({ variables: { oldDir, newDir, inRegist: true } });
    const r = data?.renameRegistFolder;
    setActionMsg(r ? { ok: r.ok, text: r.message } : { ok: false, text: "API応答なし" });
    if (r?.ok) onCompare();
  };

  const onRegist = async () => {
    if (
      !window.confirm(
        "REGIST_DIR 配下の全エントリを tb_bok に登録し、\nCOMIC_ROOT にコピー後 REGIST_DIR を空にします。\n実行しますか？"
      )
    ) {
      return;
    }
    setRegistJobId(null);
    const { data } = await doRegist();
    if (data?.startRegistUnregistAll?.id) {
      setRegistJobId(data.startRegistUnregistAll.id);
    }
  };

  const onRegistEr = async () => {
    if (
      !window.confirm(
        "ER_DEST_DIR 配下の全エントリを tb_bok に登録 (bok_vch9='adult') し、\n" +
          "ER_COMIC_ROOT にコピー後 ER_DEST_DIR を空にします。\n実行しますか？"
      )
    ) {
      return;
    }
    setRegistErJobId(null);
    const { data } = await doRegistEr();
    if (data?.startRegistErUnregistAll?.id) {
      setRegistErJobId(data.startRegistErUnregistAll.id);
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">比較標準</h2>

      <Card className="p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={onCompare} disabled={compareState.loading}>
            {compareState.loading ? "取得中…" : "比較取得"}
          </Button>
          <Button variant="default" onClick={onRegist} disabled={registState.loading}>
            {registState.loading ? "起動中…" : "NormalComic登録"}
          </Button>
          <Button
            variant="destructive"
            onClick={onRegistEr}
            disabled={registErState.loading}
            title="ER_DEST_DIR → ER_COMIC_ROOT に登録 (bok_vch9='adult')"
          >
            {registErState.loading ? "起動中…" : "ERO Comic登録"}
          </Button>
          {result && (
            <span className="text-xs text-muted-foreground tabular-nums ml-auto">
              {result.totalEntries} 件 / baseDir: {result.baseDir}
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

        <JobProgress jobId={registJobId} />
        <JobProgress jobId={registErJobId} />

        {result && result.logs && result.logs.length > 0 && (
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer">
              比較取得ログ ({result.logs.length}行)
            </summary>
            <pre className="mt-1 max-h-64 overflow-auto bg-background border rounded p-2 whitespace-pre-wrap">
              {result.logs.join("\n")}
            </pre>
          </details>
        )}
      </Card>

      {entries.length > 0 && (
        <Card className="p-0 overflow-hidden">
          <div className="max-h-[60vh] overflow-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted sticky top-0">
                <tr>
                  <th className="text-left p-2 font-medium w-8">#</th>
                  <th className="text-left p-2 font-medium">REGIST_DIR パス</th>
                  <th className="text-left p-2 font-medium">既存巻 (stock) — 巻毎に入換/削除</th>
                  <th className="text-left p-2 font-medium w-[16rem]">行操作</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e, i) => {
                  return (
                    <tr key={e.folderPath} className="border-t align-top">
                      <td className="p-2 tabular-nums">{i + 1}</td>
                      <td className="p-2 font-mono break-all">{e.folderPath}</td>
                      <td className="p-2">
                        {e.stockBooks.length === 0 ? (
                          <span className="text-muted-foreground">なし</span>
                        ) : (
                          <ul className="space-y-1">
                            {e.stockBooks.map((s) => {
                              const done = doneStocks.has(s.folderPath);
                              return (
                                <li
                                  key={s.id}
                                  className={
                                    "flex items-center gap-1.5 " +
                                    (done ? "opacity-40 line-through" : "")
                                  }
                                >
                                  <span
                                    className="font-mono text-amber-700 tabular-nums w-12 shrink-0"
                                    title={s.folderPath}
                                  >
                                    {s.no}
                                  </span>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={done}
                                    onClick={() => onExchangeStock(s)}
                                    title={`REGIST_DIR${s.folderPath} → COMIC_ROOT${s.folderPath}`}
                                  >
                                    入換
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    disabled={done}
                                    onClick={() => onDeleteStock(s)}
                                  >
                                    削除
                                  </Button>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </td>
                      <td className="p-2">
                        <div className="flex flex-wrap gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => onRename(e)}
                          >
                            変更
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {result && entries.length === 0 && !compareState.loading && (
        <div className="text-sm text-muted-foreground">
          REGIST_DIR 配下にエントリがありません。
        </div>
      )}
    </div>
  );
}
