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
  const [error, setError] = useState<string | null>(null);
  const [login, { loading }] = useMutation(LOGIN);
  const client = useApolloClient();
  const navigate = useNavigate();

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await login({ variables: { email, password } });
      // ME を再取得して認証状態をキャッシュに反映
      await client.refetchQueries({ include: [ME] });
      navigate({ to: "/" });
    } catch (err: any) {
      const msg = err?.message ?? "ログインに失敗しました";
      if (msg.includes("INVALID_CREDENTIALS")) {
        setError("メールアドレスまたはパスワードが違います");
      } else {
        setError(msg);
      }
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <Card className="w-full max-w-sm p-6 space-y-4">
        <div>
          <h1 className="text-2xl font-bold">zComic</h1>
          <p className="text-sm text-muted-foreground">ログイン</p>
        </div>
        <form onSubmit={onSubmit} className="space-y-3">
          <Input
            type="email"
            placeholder="メールアドレス"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
          />
          <Input
            type="password"
            placeholder="パスワード"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
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
