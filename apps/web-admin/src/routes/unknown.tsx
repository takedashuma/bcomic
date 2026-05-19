import { useEffect, useState } from "react";
import { useLazyQuery, useMutation } from "@apollo/client";
import {
  LIST_UNKNOWN_FOLDERS,
  SEARCH_MK,
  RENAME_REGIST_FOLDER,
} from "@/gql/operations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";

/**
 * Unknown 検索 (旧 V_ComicSearchUnknown 後継)
 *
 * 旧PHP:
 *   - /admin_new/search_unknown.php           REGIST_DIR/0 の Unknown 一覧
 *   - /crawlMangaOukoku/read_html.php         マンガ王国検索 (`/search/word/<kw>`)
 *   - /admin_new/chgParentDirNameInp.php +    フォルダ名変更
 *     _folderMove.php / _folderRenane.php
 *
 * 仕様 (旧UIに準拠):
 *   1) 「Search UnKnown」 → REGIST_DIR/0 のフォルダ一覧
 *      各行: Title (フォルダ名 全文) と Link (日本語タイトル) のみ。
 *      Link をクリックすると 日本語タイトル を下段の検索テキストにセットして
 *      マンガ王国検索を実行する。
 *   2) 検索ヒットなしの場合は検索テキストを編集して再検索。
 *   3) 「変更」ボタンで 著者 テキストに入力された値を該当フォルダの名称に反映:
 *      /0/[Unknown;Unknown] EnT;JpT  →  /<initial>/<著者> EnT;JpT
 */
interface UnknownItem {
  folderName: string;
  folderPath: string;
  title: string;
  titleEN: string;
  titleJP: string;
}
interface MKCandidate {
  sourceSite: string;
  titleJa: string;
  authorJa: string | null;
  url: string | null;
  coverUrl: string | null;
  description: string | null;
}

export function UnknownPage() {
  const [selected, setSelected] = useState<UnknownItem | null>(null);
  const [keyword, setKeyword] = useState("");
  const [authorInput, setAuthorInput] = useState("");
  const [actionMsg, setActionMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [doneSet, setDoneSet] = useState<Set<string>>(new Set());

  const [runList, listState] = useLazyQuery(LIST_UNKNOWN_FOLDERS, {
    fetchPolicy: "network-only",
  });
  const [runMK, mkState] = useMutation(SEARCH_MK);
  const [doRename] = useMutation(RENAME_REGIST_FOLDER);

  const items: UnknownItem[] = listState.data?.listUnknownFolders?.items ?? [];
  const result = listState.data?.listUnknownFolders;
  const rawCandidates: MKCandidate[] =
    (mkState.data as any)?.searchFromMangaKingdom ?? [];
  // "(error) ..." / "(no hits)" は実候補ではなく診断メッセージとして表示する
  const isErrorEntry = (c: MKCandidate) =>
    c.titleJa.startsWith("(error)") || c.titleJa === "(no hits)";
  const candidates: MKCandidate[] = rawCandidates.filter((c) => !isErrorEntry(c));
  const diagEntry: MKCandidate | null = rawCandidates.find(isErrorEntry) ?? null;
  // 旧UIに準拠して "第一候補" を Bottom Card のメイン表示として扱う
  const top: MKCandidate | null = candidates[0] ?? null;

  // マンガ王国検索が完了したら 著者 入力欄にデフォルト値をセット
  useEffect(() => {
    if (top && top.authorJa) {
      // 旧UIの形式: "[;あましろ澪,桐乃フリゲート,あかつき茜]"
      setAuthorInput(`[;${top.authorJa}]`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [top?.titleJa]);

  const markDone = (folderPath: string) => {
    setDoneSet((s) => {
      const next = new Set(s);
      next.add(folderPath);
      return next;
    });
  };

  const onList = () => {
    setActionMsg(null);
    setDoneSet(new Set());
    setSelected(null);
    runList();
  };

  const runMKWith = (kw: string) => {
    const q = kw.trim();
    if (!q) return;
    setKeyword(q);
    runMK({ variables: { titleJa: q } });
  };

  /** タイトル行の Link クリック: 日本語タイトルで王国検索を実行 */
  const onClickLink = (item: UnknownItem) => {
    setSelected(item);
    setAuthorInput(""); // クリアして useEffect で再セット
    runMKWith(item.titleJP || item.titleEN);
  };

  /**
   * 「変更」ボタン: 著者 入力値で該当フォルダを rename。
   *   旧: /<initial>/[<EnAuth>;<JpAuth>] <EnTitle>;<JpTitle>
   *   新フォルダ名 = "<authorInput> <EnTitle>;<JpTitle>"
   *   initial   = EnAuth 先頭1文字を大文字、無ければ JpAuth 先頭1文字、それも無ければ "0"
   */
  const onApply = async () => {
    if (!selected) {
      setActionMsg({ ok: false, text: "上のリストでまず対象を選択してください" });
      return;
    }
    const author = authorInput.trim();
    if (!author) {
      setActionMsg({ ok: false, text: "著者 を入力してください" });
      return;
    }
    // [EnAuth;JpAuth] 部分から initial を算出
    const m = /^\[([^;\]]*);?([^\]]*)\]\s*$/.exec(author);
    const enAuth = (m?.[1] ?? "").trim();
    const jpAuth = (m?.[2] ?? "").trim();
    let initial = (enAuth[0] || jpAuth[0] || "0").toUpperCase();
    if (!/^[A-Z0-9]$/.test(initial)) initial = "0";
    const enTitle = selected.titleEN;
    const jpTitle = selected.titleJP;
    const newName = `${author} ${enTitle};${jpTitle}`;
    const oldDir = selected.folderPath; // /0/[Unknown;Unknown] X;Y
    const newDir = `/${initial}/${newName}`;
    if (!window.confirm(`rename:\n${oldDir}\n→ ${newDir}`)) return;
    const { data } = await doRename({
      variables: { oldDir, newDir, inRegist: true },
    });
    const r = data?.renameRegistFolder;
    setActionMsg(r ? { ok: r.ok, text: r.message } : { ok: false, text: "API応答なし" });
    if (r?.ok) {
      markDone(selected.folderPath);
      setSelected(null);
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Unknown 検索</h2>

      {/* ===== 上段: Search UnKnown 一覧 ===== */}
      <Card className="p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={onList} disabled={listState.loading}>
            {listState.loading ? "取得中…" : "Search UnKnown"}
          </Button>
          {result && (
            <span className="text-xs text-muted-foreground tabular-nums ml-auto">
              {result.total} 件 / {result.baseDir}
            </span>
          )}
        </div>

        {result && result.logs && result.logs.length > 0 && (
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer">
              スキャンログ ({result.logs.length}行)
            </summary>
            <pre className="mt-1 max-h-48 overflow-auto bg-background border rounded p-2 whitespace-pre-wrap">
              {result.logs.join("\n")}
            </pre>
          </details>
        )}

        {items.length > 0 && (
          <ul className="divide-y border rounded">
            {items.map((it) => {
              const done = doneSet.has(it.folderPath);
              const isSel = selected?.folderPath === it.folderPath;
              return (
                <li
                  key={it.folderPath}
                  className={
                    "p-3 " +
                    (done ? "opacity-40 line-through " : "") +
                    (isSel ? "bg-amber-50" : "")
                  }
                >
                  <div className="grid grid-cols-[5rem_1fr] gap-x-3 gap-y-1 text-sm">
                    <div className="text-muted-foreground">Title</div>
                    <div className="break-all">{it.folderName}</div>
                    <div className="text-muted-foreground">Link</div>
                    <div>
                      <button
                        type="button"
                        disabled={done}
                        onClick={() => onClickLink(it)}
                        className="text-emerald-700 hover:text-emerald-900 hover:underline disabled:opacity-40 disabled:no-underline text-left break-all"
                      >
                        {it.titleJP || it.titleEN}
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {/* ===== 中段: 日本語タイトル 入力 + マンガ王国検索 ===== */}
      <Card className="p-4 space-y-3">
        <div className="grid grid-cols-[8rem_1fr] gap-3 items-center">
          <label className="text-sm">日本語タイトル</label>
          <Input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="キーワード（上のリンクをクリックすると自動入力）"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing && keyword) {
                runMKWith(keyword);
              }
            }}
          />
        </div>
        <div className="flex justify-center">
          <Button
            onClick={() => runMKWith(keyword)}
            disabled={!keyword || mkState.loading}
          >
            {mkState.loading ? "検索中…" : "Search from マンガ王国"}
          </Button>
        </div>
      </Card>

      {/* ===== 下段: 王国検索結果 + 変更フォーム ===== */}
      {selected && (
        <Card className="p-4 space-y-3">
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

          {mkState.loading && (
            <div className="text-sm text-muted-foreground">マンガ王国検索中…</div>
          )}

          {!mkState.loading && !top && mkState.called && (
            <div className="text-sm space-y-2">
              <div className="text-amber-700">
                ヒットなし。検索テキストを編集して再検索してください。
              </div>
              {diagEntry && (
                <details className="rounded border border-red-300 bg-red-50 text-red-800 p-2">
                  <summary className="cursor-pointer text-xs font-medium">
                    {diagEntry.titleJa}
                  </summary>
                  {diagEntry.url && (
                    <div className="text-xs mt-1">
                      対象URL:{" "}
                      <a
                        href={diagEntry.url}
                        target="_blank"
                        rel="noreferrer"
                        className="underline"
                      >
                        {diagEntry.url}
                      </a>
                    </div>
                  )}
                  {diagEntry.description && (
                    <pre className="text-[10px] mt-1 max-h-32 overflow-auto whitespace-pre-wrap">
                      {diagEntry.description}
                    </pre>
                  )}
                </details>
              )}
            </div>
          )}

          {top && (
            <div className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-2 items-start text-sm">
              {top.coverUrl && (
                <>
                  <div className="text-muted-foreground">表紙</div>
                  <div>
                    <img
                      src={top.coverUrl}
                      alt=""
                      className="w-20 h-28 object-cover bg-muted rounded border"
                    />
                  </div>
                </>
              )}

              <div className="text-muted-foreground">タイトル</div>
              <div className="font-medium break-all">{top.titleJa}</div>

              <label className="text-muted-foreground pt-2" htmlFor="kw">
                検索テキスト
              </label>
              <div className="flex gap-2">
                <Input
                  id="kw"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.nativeEvent.isComposing && keyword) {
                      runMKWith(keyword);
                    }
                  }}
                />
                <Button
                  variant="outline"
                  onClick={() => runMKWith(keyword)}
                  disabled={!keyword || mkState.loading}
                >
                  再検索
                </Button>
              </div>

              <label className="text-muted-foreground pt-2" htmlFor="auth">
                著者
              </label>
              <Input
                id="auth"
                value={authorInput}
                onChange={(e) => setAuthorInput(e.target.value)}
                placeholder="例: [Author;著者] / [;あましろ澪,桐乃フリゲート]"
              />

              <div className="text-muted-foreground pt-1">変更</div>
              <div>
                <Button onClick={onApply} disabled={!authorInput.trim()}>
                  変更
                </Button>
              </div>

              <div className="text-muted-foreground">LinkPage</div>
              <div>
                {top.url ? (
                  <a
                    href={top.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-emerald-700 hover:underline break-all"
                  >
                    {top.url}
                  </a>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </div>
            </div>
          )}

          {/* 第2候補以下は折りたたみで参照可能に */}
          {candidates.length > 1 && (
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground">
                その他の候補 ({candidates.length - 1} 件)
              </summary>
              <ul className="mt-2 space-y-1">
                {candidates.slice(1).map((c, i) => (
                  <li key={i} className="border rounded p-2 flex items-start gap-2">
                    {c.coverUrl && (
                      <img
                        src={c.coverUrl}
                        alt=""
                        className="w-10 h-14 object-cover bg-muted rounded"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="font-medium break-all">{c.titleJa}</div>
                      {c.authorJa && (
                        <div className="text-muted-foreground">{c.authorJa}</div>
                      )}
                      {c.url && (
                        <a
                          href={c.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-emerald-700 hover:underline break-all"
                        >
                          {c.url}
                        </a>
                      )}
                      <div className="mt-1">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setAuthorInput(`[;${c.authorJa ?? ""}]`);
                          }}
                        >
                          この著者を採用
                        </Button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </Card>
      )}
    </div>
  );
}
