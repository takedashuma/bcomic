import { useState } from "react";
import { useMutation, useApolloClient } from "@apollo/client";
import { useNavigate } from "@tanstack/react-router";
import { ADMIN_LOGIN, ME } from "@/gql/operations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";

export function LoginPage() {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [login, { loading }] = useMutation(ADMIN_LOGIN);
  const client = useApolloClient();
  const navigate = useNavigate();

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await login({ variables: { name, password } });
      await client.refetchQueries({ include: [ME] });
      navigate({ to: "/" });
    } catch (err: any) {
      const msg = err?.message ?? "ログインに失敗しました";
      if (msg.includes("INVALID_CREDENTIALS")) {
        setError("ユーザー名またはパスワードが違います");
      } else {
        setError(msg);
      }
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <Card className="w-full max-w-sm p-6 space-y-4">
        <div>
          <h1 className="text-2xl font-bold text-primary">zComic Admin</h1>
          <p className="text-sm text-muted-foreground">管理者ログイン</p>
        </div>
        <form onSubmit={onSubmit} className="space-y-3">
          <Input
            type="text"
            placeholder="ユーザー名"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoFocus
            autoComplete="username"
          />
          <Input
            type="password"
            placeholder="パスワード"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "ログイン中…" : "ログイン"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
