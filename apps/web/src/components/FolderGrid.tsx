import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Star } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useMutation } from "@apollo/client";
import { TOGGLE_FAVORITE } from "@/gql/operations";
import { imgUrl } from "@/lib/apollo";

interface FolderItem {
  id: string;
  authorEn: string;
  titleEn: string;
  authorJa?: string | null;
  titleJa?: string | null;
  volumeCount: number;
  isFavorite: boolean;
  latestVolume?: { id: number; no?: string | null; noJa?: string | null } | null;
}

export function FolderGrid({ items }: { items: FolderItem[] }) {
  const [toggleFavorite] = useMutation(TOGGLE_FAVORITE);
  // 同じアイテムへの連打を防止するための in-flight トラッキング。
  // 1回目のリクエスト完了前に2回目以降のクリックを破棄する。
  // これにより、Apollo の optimisticResponse / cache.modify を絡めても
  // it.isFavorite の "古い props" による誤判定が起きない。
  const [pending, setPending] = useState<Record<string, true>>({});

  const onToggle = (it: FolderItem) => {
    if (pending[it.id]) return; // すでに同じアイテムの mutation が走行中
    const next = !it.isFavorite;
    setPending((p) => ({ ...p, [it.id]: true }));
    toggleFavorite({
      variables: { authorEn: it.authorEn, titleEn: it.titleEn },
      optimisticResponse: { toggleFavorite: next },
      update: (cache, { data }) => {
        const result = data?.toggleFavorite;
        if (result === undefined) return;
        cache.modify({
          id: cache.identify({ __typename: "ComicFolder", id: it.id }),
          fields: { isFavorite: () => result },
        });
        cache.evict({ fieldName: "favorites" });
        cache.gc();
      },
    }).finally(() => {
      setPending((p) => {
        const { [it.id]: _omit, ...rest } = p;
        return rest;
      });
    });
  };

  if (items.length === 0) {
    return <div className="text-center text-muted-foreground py-12 text-sm">該当する作品がありません</div>;
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
      {items.map((it) => {
        const busy = !!pending[it.id];
        return (
          <Card key={it.id} className="overflow-hidden group flex flex-col">
            <Link
              to="/folder/$authorEn/$titleEn"
              params={{ authorEn: it.authorEn, titleEn: it.titleEn }}
              className="block"
            >
              <div className="aspect-[3/4] bg-muted overflow-hidden">
                {it.latestVolume ? (
                  <img
                    src={imgUrl(`/img/cover/${it.latestVolume.id}?w=400`)}
                    alt={it.titleJa ?? it.titleEn}
                    loading="lazy"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                  />
                ) : null}
              </div>
              <div className="px-2 pt-2 space-y-0.5">
                <div className="text-sm font-medium leading-tight line-clamp-2">
                  <span className="text-muted-foreground mr-1">{it.volumeCount}冊</span>
                  {it.titleJa ?? it.titleEn}
                </div>
              </div>
            </Link>

            <div className="px-2 pb-2 pt-1 flex items-center gap-1">
              <button
                type="button"
                disabled={busy}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onToggle(it);
                }}
                className={
                  "shrink-0 p-0.5 rounded hover:bg-muted transition-opacity " +
                  (busy ? "opacity-50 cursor-wait" : "")
                }
                aria-label={it.isFavorite ? "お気入から削除" : "お気入に追加"}
                title={it.isFavorite ? "お気入から削除" : "お気入に追加"}
              >
                <Star
                  className={
                    "w-4 h-4 " +
                    (it.isFavorite ? "fill-yellow-400 text-yellow-500" : "text-muted-foreground")
                  }
                />
              </button>
              <Link
                to="/folder/$authorEn/$titleEn"
                params={{ authorEn: it.authorEn, titleEn: it.titleEn }}
                className="text-xs text-muted-foreground line-clamp-1 hover:underline min-w-0"
              >
                {it.authorJa ?? it.authorEn}
              </Link>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
