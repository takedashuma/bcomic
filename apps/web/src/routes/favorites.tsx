import { useEffect, useRef, useState } from "react";
import { useQuery } from "@apollo/client";
import { useSearch, useNavigate } from "@tanstack/react-router";
import { FAVORITES } from "@/gql/operations";
import { Input } from "@/components/ui/input";
import { FolderGrid } from "@/components/FolderGrid";
import { Paginator } from "@/components/Paginator";

/**
 * お気入一覧。検索ボックスの IME 対策は HomePage と同じ。
 */
export function FavoritesPage() {
  const search = useSearch({ strict: false }) as { page?: number; q?: string };
  const navigate = useNavigate();
  const page = search.page ?? 1;
  const q = search.q ?? "";

  const [localQ, setLocalQ] = useState(q);
  const composingRef = useRef(false);

  useEffect(() => {
    setLocalQ(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  // 空文字の q は URL に出さない / page は number で渡す
  const buildSearch = (qVal: string, pageVal: number): Record<string, any> => {
    const s: Record<string, any> = { page: pageVal };
    if (qVal) s.q = qVal;
    return s;
  };

  useEffect(() => {
    if (composingRef.current) return;
    if (localQ === q) return;
    const t = setTimeout(() => {
      navigate({ to: "/favorites", search: buildSearch(localQ, 1) } as any);
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localQ, q, navigate]);

  const { data, loading } = useQuery(FAVORITES, {
    variables: { q: q || null, page, pageSize: 24 },
  });

  const setPage = (next: number) => {
    navigate({ to: "/favorites", search: buildSearch(q, next) } as any);
  };

  const commitSearchNow = () => {
    if (localQ === q) return;
    navigate({ to: "/favorites", search: buildSearch(localQ, 1) } as any);
  };
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    if (e.nativeEvent.isComposing || (e as any).keyCode === 229) return;
    e.preventDefault();
    commitSearchNow();
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">お気入</h2>
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
            setLocalQ((e.target as HTMLInputElement).value);
          }}
          className="max-w-xs"
        />
      </div>
      {loading && !data ? (
        <div className="text-center text-muted-foreground py-12 text-sm">読み込み中…</div>
      ) : (
        <>
          <FolderGrid items={data?.favorites?.items ?? []} />
          <Paginator
            page={data?.favorites?.page ?? 1}
            pageSize={data?.favorites?.pageSize ?? 24}
            total={data?.favorites?.total ?? 0}
            onChange={setPage}
          />
        </>
      )}
    </div>
  );
}
