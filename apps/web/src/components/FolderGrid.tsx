import { Link } from "@tanstack/react-router";
import { Star } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useMutation } from "@apollo/client";
import { TOGGLE_FAVORITE, COMIC_FOLDERS, FAVORITES } from "@/gql/operations";
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
  const [toggleFavorite] = useMutation(TOGGLE_FAVORITE, {
    refetchQueries: [{ query: COMIC_FOLDERS }, { query: FAVORITES }],
  });

  if (items.length === 0) {
    return <div className="text-center text-muted-foreground py-12 text-sm">該当する作品がありません</div>;
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
      {items.map((it) => (
        <Card key={it.id} className="overflow-hidden group">
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
            <div className="p-2 space-y-0.5">
              <div className="text-xs text-muted-foreground">{it.volumeCount}冊</div>
              <div className="text-sm font-medium leading-tight line-clamp-2">
                {it.titleJa ?? it.titleEn}
              </div>
              <div className="text-xs text-muted-foreground line-clamp-1">
                {it.authorJa ?? it.authorEn}
              </div>
            </div>
          </Link>
          <button
            onClick={(e) => {
              e.preventDefault();
              toggleFavorite({ variables: { authorEn: it.authorEn, titleEn: it.titleEn } });
            }}
            className="absolute top-2 right-2 p-1.5 rounded-full bg-background/80 backdrop-blur hover:bg-background"
            aria-label={it.isFavorite ? "お気入から削除" : "お気入に追加"}
          >
            <Star
              className={
                "w-4 h-4 " + (it.isFavorite ? "fill-yellow-400 text-yellow-500" : "text-muted-foreground")
              }
            />
          </button>
        </Card>
      ))}
    </div>
  );
}
