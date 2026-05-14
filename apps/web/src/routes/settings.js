import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { useMutation } from "@apollo/client";
import { CHANGE_PASSWORD } from "@/gql/operations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
export function SettingsPage() {
    const [oldPassword, setOld] = useState("");
    const [newPassword, setNew] = useState("");
    const [confirm, setConfirm] = useState("");
    const [msg, setMsg] = useState(null);
    const [changePassword, { loading }] = useMutation(CHANGE_PASSWORD);
    const onSubmit = async (e) => {
        e.preventDefault();
        setMsg(null);
        if (newPassword.length < 6) {
            setMsg({ type: "err", text: "新しいパスワードは6文字以上にしてください" });
            return;
        }
        if (newPassword !== confirm) {
            setMsg({ type: "err", text: "確認用パスワードが一致しません" });
            return;
        }
        try {
            await changePassword({ variables: { oldPassword, newPassword } });
            setMsg({ type: "ok", text: "パスワードを変更しました" });
            setOld("");
            setNew("");
            setConfirm("");
        }
        catch (err) {
            const m = err?.message ?? "失敗しました";
            if (m.includes("INVALID_OLD_PASSWORD")) {
                setMsg({ type: "err", text: "現在のパスワードが違います" });
            }
            else if (m.includes("PASSWORD_TOO_SHORT")) {
                setMsg({ type: "err", text: "新しいパスワードは6文字以上にしてください" });
            }
            else {
                setMsg({ type: "err", text: m });
            }
        }
    };
    return (_jsxs("div", { className: "max-w-md space-y-4", children: [_jsx("h2", { className: "text-lg font-semibold", children: "\u8A2D\u5B9A" }), _jsxs(Card, { className: "p-4", children: [_jsx("h3", { className: "font-medium mb-3", children: "\u30D1\u30B9\u30EF\u30FC\u30C9\u5909\u66F4" }), _jsxs("form", { onSubmit: onSubmit, className: "space-y-3", children: [_jsx(Input, { type: "password", placeholder: "\u73FE\u5728\u306E\u30D1\u30B9\u30EF\u30FC\u30C9", value: oldPassword, onChange: (e) => setOld(e.target.value), required: true }), _jsx(Input, { type: "password", placeholder: "\u65B0\u3057\u3044\u30D1\u30B9\u30EF\u30FC\u30C9\uFF086\u6587\u5B57\u4EE5\u4E0A\uFF09", value: newPassword, onChange: (e) => setNew(e.target.value), required: true }), _jsx(Input, { type: "password", placeholder: "\u65B0\u3057\u3044\u30D1\u30B9\u30EF\u30FC\u30C9\uFF08\u78BA\u8A8D\uFF09", value: confirm, onChange: (e) => setConfirm(e.target.value), required: true }), msg && (_jsx("p", { className: "text-sm " + (msg.type === "ok" ? "text-green-600" : "text-red-600"), children: msg.text })), _jsx(Button, { type: "submit", disabled: loading, children: loading ? "変更中…" : "変更" })] })] })] }));
}
