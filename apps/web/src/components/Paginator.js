import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Button } from "@/components/ui/button";
export function Paginator({ page, pageSize, total, onChange, }) {
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    if (totalPages <= 1)
        return null;
    return (_jsxs("div", { className: "flex items-center justify-center gap-2 py-6", children: [_jsx(Button, { variant: "outline", size: "sm", disabled: page <= 1, onClick: () => onChange(page - 1), children: "\u524D\u3078" }), _jsxs("span", { className: "text-sm text-muted-foreground tabular-nums", children: [page, " / ", totalPages] }), _jsx(Button, { variant: "outline", size: "sm", disabled: page >= totalPages, onClick: () => onChange(page + 1), children: "\u6B21\u3078" })] }));
}
