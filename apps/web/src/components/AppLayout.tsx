import { useEffect, useRef } from "react";
import { Outlet, useNavigate, useLocation } from "@tanstack/react-router";
import { useQuery, useMutation } from "@apollo/client";
import { ME, LOGOUT } from "@/gql/operations";
import { Settings, Star, Sparkles, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";

// 各タブが最後に表示していた検索状態（search params）を記憶し、
// 下部ナビのタップ時にその URL に戻れるようにする。
// 値の型(number/string)を保持するため JSON でシリアライズ。
const TAB_PATHS = ["/", "/favorites", "/settings"] as const;
type TabPath = (typeof TAB_PATHS)[number];
const STORAGE_KEY = (tab: string) => `zc:tab:last:${tab}`;

function isTabPath(p: string): p is TabPath {
  return (TAB_PATHS as readonly string[]).includes(p);
}

/**
 * 空文字/null/undefined を除き、型(number/string/boolean)はそのまま保持。
 * URL serialization で `?page="3"` のような壊れ方を防ぐため、String() で潰さない。
 */
function cleanSearch(search: Record<string, unknown> | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!search) return out;
  for (const [k, v] of Object.entries(search)) {
    if (v === undefined || v === null || v === "") continue;
    out[k] = v;
  }
  return out;
}

export function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation(); // pathname/search の変化に対してリアクティブ
  const { data, loading } = useQuery(ME);
  const [logout] = useMutation(LOGOUT);

  // タブごとの最後の search 状態（型保持）を保持する in-memory store
  const tabMemoryRef = useRef<Record<string, Record<string, unknown>>>({});

  // ルート変更時、タブ直下の URL であれば search を記憶
  useEffect(() => {
    const pathname = location.pathname;
    if (!isTabPath(pathname)) return;
    const search = cleanSearch(location.search as Record<string, unknown>);
    tabMemoryRef.current[pathname] = search;
    try {
      sessionStorage.setItem(STORAGE_KEY(pathname), JSON.stringify(search));
    } catch {
      /* noop */
    }
  }, [location.pathname, location.search]);

  // 未認証なら /login へ
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

  if (!data?.me) {
    return null;
  }

  const nav = [
    { to: "/" as TabPath, label: "新着順", icon: Sparkles },
    { to: "/favorites" as TabPath, label: "お気入", icon: Star },
    { to: "/settings" as TabPath, label: "設定", icon: Settings },
  ];

  const onTabClick = (tab: TabPath) => {
    let search = tabMemoryRef.current[tab];
    if (!search) {
      try {
        const saved = sessionStorage.getItem(STORAGE_KEY(tab));
        if (saved) search = JSON.parse(saved);
      } catch {
        /* ignore */
      }
    }
    navigate({ to: tab as any, search: (search ?? {}) as any } as any);
  };

  return (
    <div className="min-h-screen pb-16">
      {/* ヘッダー */}
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b">
        <div className="container flex h-12 items-center justify-between">
          <div className="font-semibold text-lg tracking-tight">zComic</div>
          <button
            onClick={async () => {
              await logout();
              sessionStorage.clear();
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

      {/* ボトムナビ: 同じタブを再タップで最後の検索状態(page/q)に復帰 */}
      <nav className="fixed bottom-0 inset-x-0 bg-background/95 backdrop-blur border-t">
        <div className="container grid grid-cols-3 h-14">
          {nav.map((it) => {
            const active = location.pathname === it.to;
            return (
              <button
                key={it.to}
                type="button"
                onClick={() => onTabClick(it.to)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 text-[11px] cursor-pointer w-full h-full transition-colors",
                  active
                    ? "text-primary font-medium"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <it.icon className={cn("w-5 h-5", active && "stroke-[2.4]")} />
                {it.label}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
