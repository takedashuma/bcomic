import { useState } from "react";
import { useLazyQuery, useMutation } from "@apollo/client";
import {
  COMPARE_UNREGIST,
  EXCHANGE_DIR,
  DELETE_DB_AND_BOOK,
  RENAME_REGIST_FOLDER,
  START_REGIST_UNREGIST_ALL,
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
 *      各エントリで tb_bok の既存巻数 (stock) を表示。
 *   2. 各エントリで:
 *        - 入換: REGIST_DIR/<folder> を COMIC_ROOT/<folder> に入れ替え
 *        - 削除: tb_bok から bok_txt1 contains の行を削除 + COMIC_ROOT/<folder> 削除
 *        - 変更: REGIST_DIR 配下の oldDir → newDir に rename
 *        - LinkPage: comic.k-manga.jp 検索リンクを別タブで開く
 *   3. 「NormalComic登録」 → startRegistUnregistAll 非同期ジョブ
 *      （UNREGIST 全件を tb_bok に INSERT 後、COMIC_ROOT へコピー）
 */
interface CompareEntry {
  folderPath: string;
  authorHead: string;
  authorTitleFolder: string;
  authorJa: string;
  titleJa: string;
  volumeNo: string;
  stockVolumes: string[];
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

  const [registJobId, setRegistJobId] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<{ ok: boolean; text: string } | null>(null);
  // 各エントリのアクション完了済みを行ごとに灰色表示するためのセット
  const [doneSet, setDoneSet] = useState<Set<string>>(new Set());

  const result = compareState.data?.compareUnregist;
  const entries: CompareEntry[] = result?.entries ?? [];

  const markDone = (folderPath: string) => {
    setDoneSet((s) => {
      const next = new Set(s);
      next.add(folderPath);
      return next;
    });
  };

  const onCompare = () => {
    setActionMsg(null);
    setDoneSet(new Set());
    doCompare();
  };

  const onExchange = async (entry: CompareEntry) => {
    if (!window.confirm(`入換しますか？\nREGIST_DIR${entry.folderPath} → COMIC_ROOT${entry.folderPath}`)) {
      return;
    }
    const { data } = await doExchange({ variables: { newDir: entry.folderPath } });
    const r = data?.exchangeDir;
    setActionMsg(r ? { ok: r.ok, text: r.message } : { ok: false, text: "API応答なし" });
    if (r?.ok) markDone(entry.folderPath);
  };

  const onDeleteBoth = async (entry: CompareEntry) => {
    if (
      !window.confirm(
        `DB＆ファイル削除しますか？\n${entry.folderPath}\n(tb_bok の bok_txt1 一致行も削除)`
      )
    ) {
      return;
    }
    const { data } = await doDelete({ variables: { bookPath: entry.folderPath } });
    const r = data?.deleteDBandBook;
    setActionMsg(r ? { ok: r.ok, text: r.message } : { ok: false, text: "API応答なし" });
    if (r?.ok) markDone(entry.folderPath);
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
    if (r?.ok) {
      // rename 後は元のパスを使えないので再取得を促す
      onCompare();
    }
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
                  <th className="text-left p-2 font-medium">著者 / タイトル / 巻</th>
                  <th className="text-left p-2 font-medium">REGIST_DIR パス</th>
                  <th className="text-left p-2 font-medium">stock</th>
                  <th className="text-left p-2 font-medium w-[22rem]">操作</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e, i) => {
                  const done = doneSet.has(e.folderPath);
                  const kmangaSearchUrl =
                    "https://comic.k-manga.jp/search/word/" +
                    encodeURIComponent(e.titleJa || "");
                  return (
                    <tr
                      key={e.folderPath}
                      className={
                        "border-t align-top " + (done ? "opacity-40 line-through" : "")
                      }
                    >
                      <td className="p-2 tabular-nums">{i + 1}</td>
                      <td className="p-2">
                        <div className="font-medium">{e.titleJa || "(タイトル不明)"}</div>
                        <div className="text-muted-foreground">
                          {e.authorJa || "(著者不明)"}
                        </div>
                        <div className="text-xs text-muted-foreground">巻 {e.volumeNo}</div>
                      </td>
                      <td className="p-2 font-mono break-all">{e.folderPath}</td>
                      <td className="p-2">
                        {e.stockCount > 0 ? (
                          <div className="space-y-0.5">
                            <div className="text-amber-700 font-medium tabular-nums">
                              {e.stockCount}件
                            </div>
                            <div className="text-[10px] text-muted-foreground break-all">
                              {e.stockVolumes.join(", ")}
                            </div>
                            {e.alreadyInDb && (
                              <div className="text-[10px] text-red-700 font-medium">
                                ※ 同巻あり
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">なし</span>
                        )}
                      </td>
                      <td className="p-2">
                        <div className="flex flex-wrap gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={done}
                            onClick={() => onExchange(e)}
                            title={`REGIST${e.folderPath} → COMIC${e.folderPath}`}
                          >
                            入換
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            disabled={done}
                            onClick={() => onDeleteBoth(e)}
                          >
                            削除
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={done}
                            onClick={() => onRename(e)}
                          >
                            変更
                          </Button>
                          <a
                            href={kmangaSearchUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex h-8 items-center rounded-md border border-input bg-background px-2 text-xs hover:bg-muted"
                          >
                            LinkPage
                          </a>
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
