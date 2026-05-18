import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Link } from "@tanstack/react-router";
import { Star } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useMutation } from "@apollo/client";
import { TOGGLE_FAVORITE, COMIC_FOLDERS, FAVORITES } from "@/gql/operations";
import { imgUrl } from "@/lib/apollo";
export function FolderGrid({ items }) {
    const [toggleFavorite] = useMutation(TOGGLE_FAVORITE, {
        refetchQueries: [{ query: COMIC_FOLDERS }, { query: FAVORITES }],
    });
    if (items.length === 0) {
        return _jsx("div", { className: "text-center text-muted-foreground py-12 text-sm", children: "\u8A72\u5F53\u3059\u308B\u4F5C\u54C1\u304C\u3042\u308A\u307E\u305B\u3093" });
    }
    return (_jsx("div", { className: "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3", children: items.map((it) => (_jsxs(Card, { className: "overflow-hidden group flex flex-col", children: [_jsxs(Link, { to: "/folder/$authorEn/$titleEn", params: { authorEn: it.authorEn, titleEn: it.titleEn }, className: "block", children: [_jsx("div", { className: "aspect-[3/4] bg-muted overflow-hidden", children: it.latestVolume ? (_jsx("img", { src: imgUrl(`/img/cover/${it.latestVolume.id}?w=400`), alt: it.titleJa ?? it.titleEn, loading: "lazy", className: "w-full h-full object-cover group-hover:scale-105 transition-transform" })) : null }), _jsx("div", { className: "px-2 pt-2 space-y-0.5", children: _jsxs("div", { className: "text-sm font-medium leading-tight line-clamp-2", children: [_jsxs("span", { className: "text-muted-foreground mr-1", children: [it.volumeCount, "\u518A"] }), it.titleJa ?? it.titleEn] }) })] }), _jsxs("div", { className: "px-2 pb-2 pt-1 flex items-center gap-1", children: [_jsx("button", { type: "button", onClick: (e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                toggleFavorite({ variables: { authorEn: it.authorEn, titleEn: it.titleEn } });
                            }, className: "shrink-0 p-0.5 rounded hover:bg-muted", "aria-label": it.isFavorite ? "お気入から削除" : "お気入に追加", title: it.isFavorite ? "お気入から削除" : "お気入に追加", children: _jsx(Star, { className: "w-4 h-4 " +
                                    (it.isFavorite ? "fill-yellow-400 text-yellow-500" : "text-muted-foreground") }) }), _jsx(Link, { to: "/folder/$authorEn/$titleEn", params: { authorEn: it.authorEn, titleEn: it.titleEn }, className: "text-xs text-muted-foreground line-clamp-1 hover:underline min-w-0", children: it.authorJa ?? it.authorEn })] })] }, it.id))) }));
}
