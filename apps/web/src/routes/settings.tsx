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
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [changePassword, { loading }] = useMutation(CHANGE_PASSWORD);

  const onSubmit = async (e: React.FormEvent) => {
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
    } catch (err: any) {
      const m = err?.message ?? "失敗しました";
      if (m.includes("INVALID_OLD_PASSWORD")) {
        setMsg({ type: "err", text: "現在のパスワードが違います" });
      } else if (m.includes("PASSWORD_TOO_SHORT")) {
        setMsg({ type: "err", text: "新しいパスワードは6文字以上にしてください" });
      } else {
        setMsg({ type: "err", text: m });
      }
    }
  };

  return (
    <div className="max-w-md space-y-4">
      <h2 className="text-lg font-semibold">設定</h2>
      <Card className="p-4">
        <h3 className="font-medium mb-3">パスワード変更</h3>
        <form onSubmit={onSubmit} className="space-y-3">
          <Input
            type="password"
            placeholder="現在のパスワード"
            value={oldPassword}
            onChange={(e) => setOld(e.target.value)}
            required
          />
          <Input
            type="password"
            placeholder="新しいパスワード（6文字以上）"
            value={newPassword}
            onChange={(e) => setNew(e.target.value)}
            required
          />
          <Input
            type="password"
            placeholder="新しいパスワード（確認）"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
          />
          {msg && (
            <p className={"text-sm " + (msg.type === "ok" ? "text-green-600" : "text-red-600")}>
              {msg.text}
            </p>
          )}
          <Button type="submit" disabled={loading}>
            {loading ? "変更中…" : "変更"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
