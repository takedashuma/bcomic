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
    return (_jsx("div", { className: "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3", children: items.map((it) => (_jsxs(Card, { className: "overflow-hidden group", children: [_jsxs(Link, { to: "/folder/$authorEn/$titleEn", params: { authorEn: it.authorEn, titleEn: it.titleEn }, className: "block", children: [_jsx("div", { className: "aspect-[3/4] bg-muted overflow-hidden", children: it.latestVolume ? (_jsx("img", { src: imgUrl(`/img/cover/${it.latestVolume.id}?w=400`), alt: it.titleJa ?? it.titleEn, loading: "lazy", className: "w-full h-full object-cover group-hover:scale-105 transition-transform" })) : null }), _jsxs("div", { className: "p-2 space-y-0.5", children: [_jsxs("div", { className: "text-xs text-muted-foreground", children: [it.volumeCount, "\u518A"] }), _jsx("div", { className: "text-sm font-medium leading-tight line-clamp-2", children: it.titleJa ?? it.titleEn }), _jsx("div", { className: "text-xs text-muted-foreground line-clamp-1", children: it.authorJa ?? it.authorEn })] })] }), _jsx("button", { onClick: (e) => {
                        e.preventDefault();
                        toggleFavorite({ variables: { authorEn: it.authorEn, titleEn: it.titleEn } });
                    }, className: "absolute top-2 right-2 p-1.5 rounded-full bg-background/80 backdrop-blur hover:bg-background", "aria-label": it.isFavorite ? "お気入から削除" : "お気入に追加", children: _jsx(Star, { className: "w-4 h-4 " + (it.isFavorite ? "fill-yellow-400 text-yellow-500" : "text-muted-foreground") }) })] }, it.id))) }));
}
