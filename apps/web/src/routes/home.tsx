import { useEffect, useRef, useState } from "react";
import { useQuery } from "@apollo/client";
import { useSearch, useNavigate } from "@tanstack/react-router";
import { COMIC_FOLDERS } from "@/gql/operations";
import { Input } from "@/components/ui/input";
import { FolderGrid } from "@/components/FolderGrid";
import { Paginator } from "@/components/Paginator";

/**
 * URL 検索パラメータ (page, q) を保持して
 * 詳細画面から戻ったときに同じページ・同じ検索状態に復帰させる。
 *
 * 検索ボックスは IME（日本語入力）対策のため:
 *   1. ローカル state で値を持ち、毎キーストロークで URL を書き換えない
 *   2. composition (IME 変換) 中は URL 更新を抑止
 *   3. 変換確定 or 300ms 入力停止で URL に反映
 */
export function HomePage() {
  const search = useSearch({ strict: false }) as { page?: number; q?: string };
  const navigate = useNavigate();
  const page = search.page ?? 1;
  const q = search.q ?? "";

  const [localQ, setLocalQ] = useState(q);
  const composingRef = useRef(false);

  // URL の q が外部要因（戻る等）で変わったらローカルにも反映
  useEffect(() => {
    setLocalQ(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  // URL search を構築するユーティリティ:
  // 空文字の q は URL に出さない（?q= が出ないようにする）。
  // page は常に number で渡す（"3" のような文字列化を防ぐ）。
  const buildSearch = (qVal: string, pageVal: number): Record<string, any> => {
    const s: Record<string, any> = { page: pageVal };
    if (qVal) s.q = qVal;
    return s;
  };

  // ローカル q が変わったらデバウンスして URL を更新
  useEffect(() => {
    if (composingRef.current) return; // IME 変換中は何もしない
    if (localQ === q) return;
    const t = setTimeout(() => {
      navigate({ to: "/", search: buildSearch(localQ, 1) } as any);
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localQ, q, navigate]);

  const { data, loading } = useQuery(COMIC_FOLDERS, {
    variables: { q: q || null, page, pageSize: 24 },
  });

  const setPage = (next: number) => {
    navigate({ to: "/", search: buildSearch(q, next) } as any);
  };

  // 入力中 debounce を待たずに Enter で即時検索する。
  // IME 変換確定の Enter (composition 中) は検索 trigger しない。
  const commitSearchNow = () => {
    if (localQ === q) return;
    navigate({ to: "/", search: buildSearch(localQ, 1) } as any);
  };
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    if (e.nativeEvent.isComposing || (e as any).keyCode === 229) return; // IME 確定の Enter は無視
    e.preventDefault();
    commitSearchNow();
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">新着順</h2>
        <Input
          placeholder="タイトル・著者を検索 (Enterで即時)"
          value={localQ}
          onChange={(e) => setLocalQ(e.target.value)}
          onKeyDown={onKeyDown}
          onCompositionStart={() => {
            composingRef.current = true;
          }}
          onCompositionEnd={(e) => {
            composingRef.current = false;
            // 変換確定後の最新値で同期（debounce 経由）
            setLocalQ((e.target as HTMLInputElement).value);
          }}
          className="max-w-xs"
        />
      </div>
      {loading && !data ? (
        <div className="text-center text-muted-foreground py-12 text-sm">読み込み中…</div>
      ) : (
        <>
          <FolderGrid items={data?.comicFolders?.items ?? []} />
          <Paginator
            page={data?.comicFolders?.page ?? 1}
            pageSize={data?.comicFolders?.pageSize ?? 24}
            total={data?.comicFolders?.total ?? 0}
            onChange={setPage}
          />
        </>
      )}
    </div>
  );
}
