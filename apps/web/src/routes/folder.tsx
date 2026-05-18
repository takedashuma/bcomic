import { useQuery, useMutation } from "@apollo/client";
import { Link, useParams } from "@tanstack/react-router";
import { COMIC_FOLDER_DETAIL, TOGGLE_FAVORITE, COMIC_FOLDERS, FAVORITES } from "@/gql/operations";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { imgUrl } from "@/lib/apollo";
import { Star, ChevronLeft } from "lucide-react";

export function FolderPage() {
  const { authorEn, titleEn } = useParams({ strict: false }) as {
    authorEn: string;
    titleEn: string;
  };
  // 戻る挙動: ブラウザ履歴を1つ戻る = 直前にいたページ(検索/ページ番号付き) に確実に戻る
  const goBack = () => {
    if (window.history.length > 1) window.history.back();
    else window.location.assign("/");
  };
  const { data, loading } = useQuery(COMIC_FOLDER_DETAIL, {
    variables: { authorEn, titleEn },
  });
  const [toggleFavorite] = useMutation(TOGGLE_FAVORITE, {
    refetchQueries: [
      { query: COMIC_FOLDER_DETAIL, variables: { authorEn, titleEn } },
      { query: COMIC_FOLDERS },
      { query: FAVORITES },
    ],
  });

  if (loading || !data?.comicFolder) {
    return <div className="text-center text-muted-foreground py-12 text-sm">読み込み中…</div>;
  }
  const f = data.comicFolder;

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={goBack}>
        <ChevronLeft className="w-4 h-4 mr-1" /> 戻る
      </Button>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold leading-tight">{f.titleJa ?? f.titleEn}</h2>
          <p className="text-sm text-muted-foreground">{f.authorJa ?? f.authorEn}</p>
          <p className="text-xs text-muted-foreground mt-1">全 {f.volumeCount} 冊</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => toggleFavorite({ variables: { authorEn, titleEn } })}
        >
          <Star
            className={
              "w-4 h-4 mr-1 " +
              (f.isFavorite ? "fill-yellow-400 text-yellow-500" : "text-muted-foreground")
            }
          />
          {f.isFavorite ? "お気入から削除" : "お気入に追加"}
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {f.volumes.map((v: any) => (
          <Card key={v.id} className="overflow-hidden">
            <Link to="/viewer/$volumeId" params={{ volumeId: String(v.id) }} className="block">
              <div className="aspect-[3/4] bg-muted overflow-hidden">
                <img
                  src={imgUrl(`/img/cover/${v.id}?w=400`)}
                  alt={`${f.titleJa ?? f.titleEn} ${v.noJa ?? v.no}`}
                  loading="lazy"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="p-2">
                <div className="text-sm font-medium">{v.noJa ?? v.no} 巻</div>
                {v.progress?.lastPage != null && (
                  <div className="text-[11px] text-muted-foreground">
                    続き: {v.progress.lastPage + 1}p
                  </div>
                )}
              </div>
            </Link>
          </Card>
        ))}
      </div>
    </div>
  );
}
