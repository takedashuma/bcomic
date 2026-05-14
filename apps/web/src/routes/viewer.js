import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation } from "@apollo/client";
import { VOLUME, SAVE_PROGRESS } from "@/gql/operations";
import { imgUrl } from "@/lib/apollo";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
/**
 * 1ページずつ表示・右→左 のビューワー
 *   - 画面右クリック / →キー : 次（次のページへ進む）
 *   - 画面左クリック / ←キー : 前
 *   - スワイプ対応（右→左で進む）
 *   - 5秒ごと or ページ変更時に閲覧位置を保存（debounce）
 */
export function ViewerPage() {
    const { volumeId } = useParams({ strict: false });
    const vid = Number(volumeId);
    const navigate = useNavigate();
    const { data } = useQuery(VOLUME, { variables: { id: vid } });
    const [saveProgress] = useMutation(SAVE_PROGRESS);
    const [page, setPage] = useState(null);
    const containerRef = useRef(null);
    const total = data?.volume?.pageCount ?? 0;
    // 初回ロード時に進捗から開始
    useEffect(() => {
        if (data?.volume && page === null) {
            setPage(data.volume.progress?.lastPage ?? 0);
        }
    }, [data, page]);
    // 進捗保存（debounce 1.5秒）
    useEffect(() => {
        if (page === null)
            return;
        const t = setTimeout(() => {
            saveProgress({ variables: { volumeId: vid, page } });
        }, 1500);
        return () => clearTimeout(t);
    }, [page, vid, saveProgress]);
    // 隣ページ先読み
    useEffect(() => {
        if (page === null)
            return;
        const preload = (p) => {
            if (p < 0 || p >= total)
                return;
            const img = new Image();
            img.src = imgUrl(`/img/page/${vid}/${p}`);
        };
        preload(page + 1);
        preload(page - 1);
    }, [page, total, vid]);
    // キーボード
    useEffect(() => {
        const onKey = (e) => {
            if (page === null)
                return;
            if (e.key === "ArrowRight" || e.key === " ") {
                // 右→左方式: 右キー = 進む（= page+1）
                e.preventDefault();
                next();
            }
            else if (e.key === "ArrowLeft") {
                e.preventDefault();
                prev();
            }
            else if (e.key === "Escape") {
                navigate({ to: ".." });
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [page, total]);
    // スワイプ
    const touchRef = useRef(null);
    const onTouchStart = (e) => {
        const t = e.touches[0];
        touchRef.current = { x: t.clientX, y: t.clientY };
    };
    const onTouchEnd = (e) => {
        const start = touchRef.current;
        if (!start)
            return;
        const t = e.changedTouches[0];
        const dx = t.clientX - start.x;
        const dy = t.clientY - start.y;
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
            // 右→左にスワイプ（dx<0）で次のページ
            if (dx < 0)
                next();
            else
                prev();
        }
        touchRef.current = null;
    };
    if (!data?.volume || page === null) {
        return (_jsx("div", { className: "fixed inset-0 bg-black flex items-center justify-center text-white", children: "\u8AAD\u307F\u8FBC\u307F\u4E2D\u2026" }));
    }
    function next() {
        setPage((p) => (p === null ? null : Math.min(total - 1, p + 1)));
    }
    function prev() {
        setPage((p) => (p === null ? null : Math.max(0, p - 1)));
    }
    return (_jsxs("div", { ref: containerRef, className: "fixed inset-0 bg-black text-white select-none", onTouchStart: onTouchStart, onTouchEnd: onTouchEnd, children: [_jsx("img", { src: imgUrl(`/img/page/${vid}/${page}`), alt: `${page + 1}`, className: "absolute inset-0 m-auto max-w-full max-h-full object-contain", draggable: false }), _jsx("button", { "aria-label": "\u524D\u306E\u30DA\u30FC\u30B8", onClick: prev, className: "absolute left-0 top-0 w-1/2 h-full bg-transparent" }), _jsx("button", { "aria-label": "\u6B21\u306E\u30DA\u30FC\u30B8", onClick: next, className: "absolute right-0 top-0 w-1/2 h-full bg-transparent" }), _jsxs("div", { className: "absolute top-0 inset-x-0 p-3 flex items-center justify-between bg-gradient-to-b from-black/70 to-transparent", children: [_jsxs(Button, { variant: "ghost", size: "sm", className: "text-white hover:bg-white/10", onClick: () => history.back(), children: [_jsx(X, { className: "w-4 h-4 mr-1" }), " \u9589\u3058\u308B"] }), _jsxs("div", { className: "text-sm", children: [data.volume.titleJa ?? "", " ", data.volume.noJa ?? data.volume.no, " \u5DFB"] }), _jsxs("div", { className: "text-sm tabular-nums", children: [page + 1, " / ", total] })] }), _jsxs("div", { className: "absolute bottom-0 inset-x-0 p-3 flex items-center justify-between bg-gradient-to-t from-black/70 to-transparent", children: [_jsxs(Button, { variant: "ghost", size: "sm", className: "text-white hover:bg-white/10", onClick: prev, disabled: page <= 0, children: [_jsx(ChevronLeft, { className: "w-4 h-4" }), " \u524D"] }), _jsx("input", { type: "range", min: 0, max: Math.max(0, total - 1), value: page, onChange: (e) => setPage(Number(e.target.value)), 
                        // 右→左方式: つまみが右に行くほど後ろのページ
                        className: "w-1/2 accent-white" }), _jsxs(Button, { variant: "ghost", size: "sm", className: "text-white hover:bg-white/10", onClick: next, disabled: page >= total - 1, children: ["\u6B21 ", _jsx(ChevronRight, { className: "w-4 h-4" })] })] })] }));
}
