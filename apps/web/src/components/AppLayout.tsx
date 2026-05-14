import { useEffect } from "react";
import { Link, Outlet, useRouter, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation } from "@apollo/client";
import { ME, LOGOUT } from "@/gql/operations";
import { Settings, Star, Sparkles, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";

export function AppLayout() {
  const router = useRouter();
  const navigate = useNavigate();
  const { data, loading } = useQuery(ME);
  const [logout] = useMutation(LOGOUT);

  // 未認証なら /login へ
  useEffect(() => {
    if (!loading && !data?.me && router.state.location.pathname !== "/login") {
      navigate({ to: "/login" });
    }
  }, [loading, data, router.state.location.pathname, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground text-sm">
        Loading…
      </div>
    );
  }

  if (!data?.me) {
    return null;
  }

  const nav = [
    { to: "/", label: "新着順", icon: Sparkles },
    { to: "/favorites", label: "お気入", icon: Star },
    { to: "/settings", label: "設定", icon: Settings },
  ] as const;

  return (
    <div className="min-h-screen pb-16">
      {/* ヘッダー */}
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b">
        <div className="container flex h-12 items-center justify-between">
          <div className="font-semibold text-lg tracking-tight">zComic</div>
          <button
            onClick={async () => {
              await logout();
              window.location.href = "/login";
            }}
            className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
            aria-label="ログアウト"
          >
            <LogOut className="w-3.5 h-3.5" /> ログアウト
          </button>
        </div>
      </header>

      <main className="container py-4">
        <Outlet />
      </main>

      {/* ボトムナビ */}
      <nav className="fixed bottom-0 inset-x-0 bg-background/95 backdrop-blur border-t">
        <div className="container grid grid-cols-3 h-14">
          {nav.map((it) => {
            const active = router.state.location.pathname === it.to;
            return (
              <Link
                key={it.to}
                to={it.to}
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 text-[11px]",
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <it.icon className="w-5 h-5" />
                {it.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
