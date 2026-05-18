import { useQuery } from "@apollo/client";
import { useSearch, useNavigate } from "@tanstack/react-router";
import { COMIC_FOLDERS } from "@/gql/operations";
import { Input } from "@/components/ui/input";
import { FolderGrid } from "@/components/FolderGrid";
import { Paginator } from "@/components/Paginator";

/**
 * URL 検索パラメータ (page, q) を保持して
 * 詳細画面から戻ったときに同じページ・同じ検索状態に復帰させる
 */
export function HomePage() {
  const search = useSearch({ strict: false }) as { page?: number; q?: string };
  const navigate = useNavigate();
  const page = search.page ?? 1;
  const q = search.q ?? "";

  const { data, loading } = useQuery(COMIC_FOLDERS, {
    variables: { q: q || null, page, pageSize: 24 },
  });

  const setQ = (next: string) => {
    navigate({ to: "/", search: { q: next, page: 1 } } as any);
  };
  const setPage = (next: number) => {
    navigate({ to: "/", search: { q, page: next } } as any);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">新着順</h2>
        <Input
          placeholder="タイトル・著者を検索"
          value={q}
          onChange={(e) => setQ(e.target.value)}
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
