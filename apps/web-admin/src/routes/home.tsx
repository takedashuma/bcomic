import { useState } from "react";
import { useLazyQuery, useMutation } from "@apollo/client";
import {
  SEARCH_COMICS,
  START_EXTRACT_ALL,
  START_EXTRACT_ALL_ER,
  START_MERGE_ALL,
  MOVE_FOLDER,
  DELETE_TITLE_FOLDER,
  CREATE_TITLE_FOLDER,
} from "@/gql/operations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { JobProgress } from "@/components/JobProgress";

/**
 * Home: 直下に3つの非同期ジョブボタン + Search
 *
 *  ┌ Home (タイトル) ┐
 *  │  [rar/zip 解凍] [話フォルダー結合] [ERComic 解凍]
 *  │  ↓ ジョブ進捗パネル
 *  │
 *  │  Search: [____] [Search]
 *  │  ↓ 結果テーブル(行ごとに [移動][削除][フォルダ作成])
 *  └─────────────────
 */
export function HomePage() {
  // 3つのジョブそれぞれの jobId を独立に保持
  const [extractJobId, setExtractJobId] = useState<string | null>(null);
  const [mergeJobId, setMergeJobId] = useState<string | null>(null);
  const [erJobId, setErJobId] = useState<string | null>(null);

  const [doExtract, exState] = useMutation(START_EXTRACT_ALL);
  const [doMerge, mgState] = useMutation(START_MERGE_ALL);
  const [doEr, erState] = useMutation(START_EXTRACT_ALL_ER);

  // Search
  const [q, setQ] = useState("");
  const [runSearch, searchState] = useLazyQuery(SEARCH_COMICS, { fetchPolicy: "network-only" });

  // フォルダ操作
  const [doMove] = useMutation(MOVE_FOLDER, { refetchQueries: ["SearchComics"] });
  const [doDelete] = useMutation(DELETE_TITLE_FOLDER, { refetchQueries: ["SearchComics"] });
  const [doCreate] = useMutation(CREATE_TITLE_FOLDER);
  const [actionMsg, setActionMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const onExtract = async () => {
    setExtractJobId(null);
    const { data } = await doExtract();
    if (data?.startExtractAllArchives?.id) setExtractJobId(data.startExtractAllArchives.id);
  };
  const onMerge = async () => {
    setMergeJobId(null);
    const { data } = await doMerge();
    if (data?.startMergeAllChapters?.id) setMergeJobId(data.startMergeAllChapters.id);
  };
  const onEr = async () => {
    setErJobId(null);
    const { data } = await doEr();
    if (data?.startExtractAllErArchives?.id) setErJobId(data.startExtractAllErArchives.id);
  };

  const onMove = async (fromPath: string) => {
    const toPath = window.prompt("移動先のパスを入力 (STAGING_ROOT 配下)", fromPath);
    if (!toPath || toPath === fromPath) return;
    const { data } = await doMove({ variables: { fromPath, toPath } });
    setActionMsg(
      data?.moveFolder
        ? { ok: data.moveFolder.ok, text: data.moveFolder.message }
        : { ok: false, text: "API応答なし" }
    );
  };
  const onDelete = async (folderPath: string) => {
    if (!window.confirm(`削除しますか？\n${folderPath}\n(.__trash に退避)`)) return;
    const { data } = await doDelete({ variables: { folderPath, permanent: false } });
    setActionMsg(
      data?.deleteTitleFolder
        ? { ok: data.deleteTitleFolder.ok, text: data.deleteTitleFolder.message }
        : { ok: false, text: "API応答なし" }
    );
  };
  const onCreate = async (parentPath: string) => {
    const name = window.prompt("新規タイトルフォルダ名");
    if (!name) return;
    const { data } = await doCreate({ variables: { parentPath, name } });
    setActionMsg(
      data?.createTitleFolder
        ? { ok: data.createTitleFolder.ok, text: data.createTitleFolder.message }
        : { ok: false, text: "API応答なし" }
    );
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Home</h2>

      {/* ===== 3ボタン: テキスト入力なし。環境変数で指定されたフォルダに対して動作 ===== */}
      <Card className="p-4 space-y-3">
        <div className="flex flex-wrap gap-2">
          <Button onClick={onExtract} disabled={exState.loading || (!!extractJobId && exState.loading)}>
            rar / zip 解凍
          </Button>
          <Button onClick={onMerge} disabled={mgState.loading}>
            話フォルダー結合
          </Button>
          <Button variant="destructive" onClick={onEr} disabled={erState.loading}>
            ERComic 解凍
          </Button>
        </div>
        <JobProgress jobId={extractJobId} />
        <JobProgress jobId={mergeJobId} />
        <JobProgress jobId={erJobId} />
      </Card>

      {/* ===== Search ===== */}
      <Card className="p-4 space-y-3">
        <div className="font-medium">登録済みコミック検索</div>
        <div className="flex gap-2">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="検索文字列"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing && q) {
                runSearch({ variables: { q } });
              }
            }}
          />
          <Button onClick={() => runSearch({ variables: { q } })} disabled={!q || searchState.loading}>
            Search
          </Button>
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

        {searchState.loading && <div className="text-sm text-muted-foreground">検索中…</div>}
        {searchState.data && (
          <div className="text-sm">
            <div className="text-xs text-muted-foreground mb-1">
              {searchState.data.searchComics.length} 件
            </div>
            <div className="max-h-[28rem] overflow-auto border rounded">
              <table className="w-full text-xs">
                <thead className="bg-muted sticky top-0">
                  <tr>
                    <th className="text-left p-1.5 font-medium w-14">ID</th>
                    <th className="text-left p-1.5 font-medium">著者 / タイトル / 巻</th>
                    <th className="text-left p-1.5 font-medium">パス</th>
                    <th className="text-left p-1.5 font-medium w-48">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {searchState.data.searchComics.map((v: any) => (
                    <tr key={v.id} className="border-t align-top">
                      <td className="p-1.5 tabular-nums">{v.id}</td>
                      <td className="p-1.5">
                        <div className="font-medium">{v.titleJa || v.titleEn}</div>
                        <div className="text-muted-foreground">{v.authorJa || v.authorEn}</div>
                        <div className="text-xs text-muted-foreground">
                          巻 {v.no} / {v.vch9}
                        </div>
                      </td>
                      <td className="p-1.5 font-mono break-all">{v.folderPath}</td>
                      <td className="p-1.5">
                        <div className="flex flex-wrap gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => v.folderPath && onMove(v.folderPath)}
                          >
                            移動
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => v.folderPath && onDelete(v.folderPath)}
                          >
                            削除
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => v.folderPath && onCreate(v.folderPath)}
                          >
                            タイトルフォルダ作成
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
