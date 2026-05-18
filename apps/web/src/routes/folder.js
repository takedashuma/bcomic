import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useQuery, useMutation } from "@apollo/client";
import { Link, useParams } from "@tanstack/react-router";
import { COMIC_FOLDER_DETAIL, TOGGLE_FAVORITE, COMIC_FOLDERS, FAVORITES } from "@/gql/operations";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { imgUrl } from "@/lib/apollo";
import { Star, ChevronLeft } from "lucide-react";
export function FolderPage() {
    const { authorEn, titleEn } = useParams({ strict: false });
    // 戻る挙動: ブラウザ履歴を1つ戻る = 直前にいたページ(検索/ページ番号付き) に確実に戻る
    const goBack = () => {
        if (window.history.length > 1)
            window.history.back();
        else
            window.location.assign("/");
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
        return _jsx("div", { className: "text-center text-muted-foreground py-12 text-sm", children: "\u8AAD\u307F\u8FBC\u307F\u4E2D\u2026" });
    }
    const f = data.comicFolder;
    return (_jsxs("div", { className: "space-y-4", children: [_jsxs(Button, { variant: "ghost", size: "sm", onClick: goBack, children: [_jsx(ChevronLeft, { className: "w-4 h-4 mr-1" }), " \u623B\u308B"] }), _jsxs("div", { className: "flex items-start justify-between gap-4", children: [_jsxs("div", { children: [_jsx("h2", { className: "text-xl font-semibold leading-tight", children: f.titleJa ?? f.titleEn }), _jsx("p", { className: "text-sm text-muted-foreground", children: f.authorJa ?? f.authorEn }), _jsxs("p", { className: "text-xs text-muted-foreground mt-1", children: ["\u5168 ", f.volumeCount, " \u518A"] })] }), _jsxs(Button, { variant: "outline", size: "sm", onClick: () => toggleFavorite({ variables: { authorEn, titleEn } }), children: [_jsx(Star, { className: "w-4 h-4 mr-1 " +
                                    (f.isFavorite ? "fill-yellow-400 text-yellow-500" : "text-muted-foreground") }), f.isFavorite ? "お気入から削除" : "お気入に追加"] })] }), _jsx("div", { className: "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3", children: f.volumes.map((v) => (_jsx(Card, { className: "overflow-hidden", children: _jsxs(Link, { to: "/viewer/$volumeId", params: { volumeId: String(v.id) }, className: "block", children: [_jsx("div", { className: "aspect-[3/4] bg-muted overflow-hidden", children: _jsx("img", { src: imgUrl(`/img/cover/${v.id}?w=400`), alt: `${f.titleJa ?? f.titleEn} ${v.noJa ?? v.no}`, loading: "lazy", className: "w-full h-full object-cover" }) }), _jsxs("div", { className: "p-2", children: [_jsxs("div", { className: "text-sm font-medium", children: [v.noJa ?? v.no, " \u5DFB"] }), v.progress?.lastPage != null && (_jsxs("div", { className: "text-[11px] text-muted-foreground", children: ["\u7D9A\u304D: ", v.progress.lastPage + 1, "p"] }))] })] }) }, v.id))) })] }));
}
