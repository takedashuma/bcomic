import { useState } from "react";
import { useLazyQuery, useMutation } from "@apollo/client";
import {
  SEARCH_COMICS,
  START_EXTRACT_ALL,
  START_EXTRACT_ALL_ER,
  START_MERGE_ALL,
  MOVE_TO_REGIST,
  CREATE_REGIST_FOLDER,
  DELETE_VOLUME_DB,
  DELETE_VOLUME_DB_AND_DIR,
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
 *  │  ↓ 結果テーブル
 *  │    行毎のボタン:
 *  │      移動           : COMIC_ROOT/<folderPath> → REGIST_DIR/<folderPath>
 *  │      タイトルフォルダ作成 : REGIST_DIR/<folderPath> を空フォルダで作成 (旧 makeFolder.php)
 *  │      Delete DB     : tb_bok の該当行のみ削除 (FS は触らない)
 *  │      Delete DB&Dir : tb_bok の該当行を削除 + COMIC_ROOT/<folderPath> も rm -rf
 *  │    パスのテキストをクリック → 検索キーワード欄に流し込む
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

  // 検索結果アクション (旧 admin_new 準拠)
  const refetch = { refetchQueries: ["SearchComics"] };
  const [doMove] = useMutation(MOVE_TO_REGIST, refetch);
  const [doMakeFolder] = useMutation(CREATE_REGIST_FOLDER, refetch);
  const [doDelDB] = useMutation(DELETE_VOLUME_DB, refetch);
  const [doDelBoth] = useMutation(DELETE_VOLUME_DB_AND_DIR, refetch);
  const [actionMsg, setActionMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const setMsg = (r: any) =>
    setActionMsg(r ? { ok: r.ok, text: r.message } : { ok: false, text: "API応答なし" });

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

  /**
   * 巻フォルダ部分を除去してタイトルフォルダのパスを返す。
   *   "/H/[HaraYasuhisa;原泰久] Kingdom;キングダム -KINGDOM-/05"
   *     → "/H/[HaraYasuhisa;原泰久] Kingdom;キングダム -KINGDOM-"
   */
  const titleFolderPath = (folderPath: string): string => {
    if (!folderPath) return folderPath;
    const trimmed = folderPath.replace(/\/+$/, "");
    const idx = trimmed.lastIndexOf("/");
    if (idx <= 0) return trimmed;
    return trimmed.slice(0, idx);
  };

  /**
   * 移動: タイトル配下の全ての巻を一括で REGIST_DIR へ移動 + tb_bok の該当全巻を削除。
   *   COMIC_ROOT/<titleFolderPath> → REGIST_DIR/<titleFolderPath>
   *   tb_bok から bok_txt1 が <titleFolderPath>/... で始まる行を全削除
   */
  const onMove = async (folderPath: string) => {
    const titlePath = titleFolderPath(folderPath);
    if (
      !window.confirm(
        `タイトル配下の全ての巻を REGIST_DIR へ移動し、\n` +
          `tb_bok の該当全巻レコードも削除します。\n` +
          `実行しますか？\n${titlePath}`
      )
    ) {
      return;
    }
    const { data } = await doMove({ variables: { folderPath: titlePath } });
    setMsg(data?.moveToRegist);
  };
  /**
   * タイトルフォルダ作成: 著者/タイトル レベルのフォルダを REGIST_DIR に空で mkdir -p。
   *   巻フォルダは作らない。
   */
  const onMakeFolder = async (folderPath: string) => {
    const titlePath = titleFolderPath(folderPath);
    if (!window.confirm(`REGIST_DIR にタイトルフォルダを作成しますか？\n${titlePath}`)) return;
    const { data } = await doMakeFolder({ variables: { folderPath: titlePath } });
    setMsg(data?.createRegistFolder);
  };
  /** Delete DB: tb_bok の該当行のみ */
  const onDeleteDB = async (id: number) => {
    if (!window.confirm(`tb_bok から削除しますか？\nid=${id} (FS は残します)`)) return;
    const { data } = await doDelDB({ variables: { id } });
    setMsg(data?.deleteVolumeDB);
  };
  /** Delete DB & Dir: tb_bok + COMIC_ROOT/<folderPath> */
  const onDeleteBoth = async (id: number, folderPath: string) => {
    if (
      !window.confirm(
        `tb_bok の該当行 と COMIC_ROOT のフォルダを削除しますか？\nid=${id}\n${folderPath}`
      )
    ) {
      return;
    }
    const { data } = await doDelBoth({ variables: { id, folderPath } });
    setMsg(data?.deleteVolumeDBAndDir);
  };

  /** パスのテキスト/著者/タイトルをクリックで検索キーワードに流し込み */
  const setQAndSearch = (kw: string) => {
    const text = (kw || "").trim();
    if (!text) return;
    setQ(text);
    runSearch({ variables: { q: text } });
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
            placeholder="検索文字列（タイトル/著者/パス）"
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
                    <th className="text-left p-1.5 font-medium">パス</th>
                    <th className="text-left p-1.5 font-medium w-24">巻</th>
                    <th className="text-left p-1.5 font-medium w-[24rem]">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {searchState.data.searchComics.map((v: any) => (
                    <tr key={v.id} className="border-t align-top">
                      <td className="p-1.5 tabular-nums">{v.id}</td>
                      <td className="p-1.5">
                        <button
                          type="button"
                          onClick={() => v.folderPath && setQAndSearch(v.folderPath)}
                          className="text-left font-mono break-all hover:underline text-primary"
                          title="クリックで検索キーワードに反映"
                        >
                          {v.folderPath}
                        </button>
                      </td>
                      <td className="p-1.5">
                        <div className="font-medium tabular-nums">{v.no || "—"}</div>
                        <div className="text-muted-foreground">{v.vch9}</div>
                      </td>
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
                            variant="outline"
                            onClick={() => v.folderPath && onMakeFolder(v.folderPath)}
                          >
                            タイトルフォルダ作成
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => onDeleteDB(v.id)}
                          >
                            Delete DB
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => v.folderPath && onDeleteBoth(v.id, v.folderPath)}
                          >
                            Delete DB&Dir
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
