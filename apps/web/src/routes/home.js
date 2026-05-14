import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from "react";
import { useQuery } from "@apollo/client";
import { COMIC_FOLDERS } from "@/gql/operations";
import { Input } from "@/components/ui/input";
import { FolderGrid } from "@/components/FolderGrid";
import { Paginator } from "@/components/Paginator";
export function HomePage() {
    const [q, setQ] = useState("");
    const [page, setPage] = useState(1);
    const { data, loading } = useQuery(COMIC_FOLDERS, {
        variables: { q: q || null, page, pageSize: 24 },
    });
    return (_jsxs("div", { className: "space-y-3", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsx("h2", { className: "text-lg font-semibold", children: "\u65B0\u7740\u9806" }), _jsx(Input, { placeholder: "\u30BF\u30A4\u30C8\u30EB\u30FB\u8457\u8005\u3092\u691C\u7D22", value: q, onChange: (e) => {
                            setQ(e.target.value);
                            setPage(1);
                        }, className: "max-w-xs" })] }), loading && !data ? (_jsx("div", { className: "text-center text-muted-foreground py-12 text-sm", children: "\u8AAD\u307F\u8FBC\u307F\u4E2D\u2026" })) : (_jsxs(_Fragment, { children: [_jsx(FolderGrid, { items: data?.comicFolders?.items ?? [] }), _jsx(Paginator, { page: data?.comicFolders?.page ?? 1, pageSize: data?.comicFolders?.pageSize ?? 24, total: data?.comicFolders?.total ?? 0, onChange: setPage })] }))] }));
}
