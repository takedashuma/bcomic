import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { useMutation, useApolloClient } from "@apollo/client";
import { useNavigate } from "@tanstack/react-router";
import { LOGIN, ME } from "@/gql/operations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
export function LoginPage() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState(null);
    const [login, { loading }] = useMutation(LOGIN);
    const client = useApolloClient();
    const navigate = useNavigate();
    const onSubmit = async (e) => {
        e.preventDefault();
        setError(null);
        try {
            await login({ variables: { email, password } });
            // ME を再取得して認証状態をキャッシュに反映
            await client.refetchQueries({ include: [ME] });
            navigate({ to: "/" });
        }
        catch (err) {
            const msg = err?.message ?? "ログインに失敗しました";
            if (msg.includes("INVALID_CREDENTIALS")) {
                setError("メールアドレスまたはパスワードが違います");
            }
            else {
                setError(msg);
            }
        }
    };
    return (_jsx("div", { className: "min-h-screen flex items-center justify-center px-4", children: _jsxs(Card, { className: "w-full max-w-sm p-6 space-y-4", children: [_jsxs("div", { children: [_jsx("h1", { className: "text-2xl font-bold", children: "zComic" }), _jsx("p", { className: "text-sm text-muted-foreground", children: "\u30ED\u30B0\u30A4\u30F3" })] }), _jsxs("form", { onSubmit: onSubmit, className: "space-y-3", children: [_jsx(Input, { type: "email", placeholder: "\u30E1\u30FC\u30EB\u30A2\u30C9\u30EC\u30B9", value: email, onChange: (e) => setEmail(e.target.value), required: true, autoFocus: true }), _jsx(Input, { type: "password", placeholder: "\u30D1\u30B9\u30EF\u30FC\u30C9", value: password, onChange: (e) => setPassword(e.target.value), required: true }), error && _jsx("p", { className: "text-sm text-red-600", children: error }), _jsx(Button, { type: "submit", className: "w-full", disabled: loading, children: loading ? "ログイン中…" : "ログイン" })] })] }) }));
}
