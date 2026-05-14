import { useState } from "react";
import { useQuery } from "@apollo/client";
import { FAVORITES } from "@/gql/operations";
import { Input } from "@/components/ui/input";
import { FolderGrid } from "@/components/FolderGrid";
import { Paginator } from "@/components/Paginator";

export function FavoritesPage() {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const { data, loading } = useQuery(FAVORITES, {
    variables: { q: q || null, page, pageSize: 24 },
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">お気入</h2>
        <Input
          placeholder="タイトル・著者を検索"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
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
