import { useEffect } from "react";
import { Outlet, Link, useNavigate, useLocation } from "@tanstack/react-router";
import { useQuery, useMutation } from "@apollo/client";
import { ME, ADMIN_LOGOUT } from "@/gql/operations";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Home" },
  { to: "/unknown", label: "Unknown検索" },
  { to: "/compare-normal", label: "比較標準" },
  { to: "/compare-ero", label: "比較E" },
  { to: "/search-page", label: "Page取得" },
];

export function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { data, loading } = useQuery(ME);
  const [logout] = useMutation(ADMIN_LOGOUT);

  useEffect(() => {
    if (!loading && !data?.me && location.pathname !== "/login") {
      navigate({ to: "/login" });
    }
  }, [loading, data, location.pathname, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground text-sm">
        Loading…
      </div>
    );
  }
  if (!data?.me) return null;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b">
        <div className="container flex h-12 items-center justify-between">
          <div className="font-semibold text-lg tracking-tight text-primary">
            zComic <span className="text-xs font-normal text-muted-foreground">admin</span>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>{data.me.name}</span>
            <button
              onClick={async () => {
                await logout();
                window.location.href = "/login";
              }}
              className="hover:text-foreground"
            >
              ログアウト
            </button>
          </div>
        </div>
        <nav className="border-t bg-muted/30">
          <div className="container flex h-10 items-center gap-1 overflow-x-auto text-sm">
            {NAV.map((n) => {
              const active = location.pathname === n.to;
              return (
                <Link
                  key={n.to}
                  to={n.to as any}
                  className={cn(
                    "px-3 py-1.5 rounded-md whitespace-nowrap",
                    active ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                  )}
                >
                  {n.label}
                </Link>
              );
            })}
          </div>
        </nav>
      </header>

      <main className="container py-4">
        <Outlet />
      </main>
    </div>
  );
}
