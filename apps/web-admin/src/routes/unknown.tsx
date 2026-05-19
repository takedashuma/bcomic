import { useState } from "react";
import { useLazyQuery, useMutation } from "@apollo/client";
import { SEARCH_UNKNOWN, SEARCH_MK } from "@/gql/operations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";

export function UnknownPage() {
  const [q, setQ] = useState("");
  const [titleJa, setTitleJa] = useState("");
  const [runUnknown, unknownState] = useLazyQuery(SEARCH_UNKNOWN, { fetchPolicy: "network-only" });
  const [runMK, mkState] = useMutation(SEARCH_MK);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Unknown 検索</h2>

      <Card className="p-4 space-y-3">
        <div className="font-medium">未識別コミック一覧</div>
        <div className="flex gap-2">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="絞り込み（任意）"
          />
          <Button onClick={() => runUnknown({ variables: { q: q || null, page: 1 } })} disabled={unknownState.loading}>
            Search Unknown
          </Button>
        </div>
        {unknownState.data?.searchUnknown && (
          <div className="text-sm">
            <div className="text-xs text-muted-foreground mb-1">
              {unknownState.data.searchUnknown.total} 件中 {unknownState.data.searchUnknown.items.length} 表示
            </div>
            <div className="max-h-80 overflow-auto border rounded">
              <table className="w-full text-xs">
                <thead className="bg-muted sticky top-0">
                  <tr>
                    <th className="text-left p-1.5 font-medium">ID</th>
                    <th className="text-left p-1.5 font-medium">著者</th>
                    <th className="text-left p-1.5 font-medium">タイトル</th>
                    <th className="text-left p-1.5 font-medium">パス</th>
                  </tr>
                </thead>
                <tbody>
                  {unknownState.data.searchUnknown.items.map((v: any) => (
                    <tr key={v.id} className="border-t">
                      <td className="p-1.5 tabular-nums">{v.id}</td>
                      <td className="p-1.5">{v.authorJa || "—"}</td>
                      <td className="p-1.5">{v.titleJa || "—"}</td>
                      <td className="p-1.5 font-mono break-all">{v.folderPath}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Card>

      <Card className="p-4 space-y-3">
        <div className="font-medium">マンガ王国から検索</div>
        <div className="flex gap-2">
          <Input
            value={titleJa}
            onChange={(e) => setTitleJa(e.target.value)}
            placeholder="日本語タイトル"
          />
          <Button
            onClick={() => runMK({ variables: { titleJa } })}
            disabled={!titleJa || mkState.loading}
          >
            {mkState.loading ? "検索中…" : "Search From マンガ王国"}
          </Button>
        </div>
        {mkState.data?.searchFromMangaKingdom && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {mkState.data.searchFromMangaKingdom.map((c: any, i: number) => (
              <div key={i} className="border rounded p-2 text-sm flex gap-2">
                {c.coverUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.coverUrl} alt="" className="w-12 h-16 object-cover bg-muted" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{c.titleJa}</div>
                  <div className="text-xs text-muted-foreground">{c.authorJa}</div>
                  {c.url && (
                    <a href={c.url} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline break-all">
                      {c.url}
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
