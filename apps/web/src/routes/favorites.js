import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useQuery } from "@apollo/client";
import { useSearch, useNavigate } from "@tanstack/react-router";
import { FAVORITES } from "@/gql/operations";
import { Input } from "@/components/ui/input";
import { FolderGrid } from "@/components/FolderGrid";
import { Paginator } from "@/components/Paginator";
export function FavoritesPage() {
    const search = useSearch({ strict: false });
    const navigate = useNavigate();
    const page = search.page ?? 1;
    const q = search.q ?? "";
    const { data, loading } = useQuery(FAVORITES, {
        variables: { q: q || null, page, pageSize: 24 },
    });
    const setQ = (next) => {
        navigate({ to: "/favorites", search: { q: next, page: 1 } });
    };
    const setPage = (next) => {
        navigate({ to: "/favorites", search: { q, page: next } });
    };
    return (_jsxs("div", { className: "space-y-3", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsx("h2", { className: "text-lg font-semibold", children: "\u304A\u6C17\u5165" }), _jsx(Input, { placeholder: "\u30BF\u30A4\u30C8\u30EB\u30FB\u8457\u8005\u3092\u691C\u7D22", value: q, onChange: (e) => setQ(e.target.value), className: "max-w-xs" })] }), loading && !data ? (_jsx("div", { className: "text-center text-muted-foreground py-12 text-sm", children: "\u8AAD\u307F\u8FBC\u307F\u4E2D\u2026" })) : (_jsxs(_Fragment, { children: [_jsx(FolderGrid, { items: data?.favorites?.items ?? [] }), _jsx(Paginator, { page: data?.favorites?.page ?? 1, pageSize: data?.favorites?.pageSize ?? 24, total: data?.favorites?.total ?? 0, onChange: setPage })] }))] }));
}
