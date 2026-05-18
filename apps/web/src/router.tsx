import { Outlet, createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import { AppLayout } from "./components/AppLayout";
import { LoginPage } from "./routes/login";
import { HomePage } from "./routes/home";
import { FavoritesPage } from "./routes/favorites";
import { SettingsPage } from "./routes/settings";
import { FolderPage } from "./routes/folder";
import { ViewerPage } from "./routes/viewer";

// /login のみレイアウト外で扱いたいため、Root ルートで分岐
const rootRoute = createRootRoute({
  component: () => <Outlet />,
});

// /login
const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  component: LoginPage,
});

// /viewer はフルスクリーンのためレイアウト外
const viewerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/viewer/$volumeId",
  component: ViewerPage,
});

// 認証必須のレイアウト配下
const authedRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "authed",
  component: AppLayout,
});

// 一覧系ルートは search params (page, q) を URL に反映する。
// validateSearch をルート側に定義すると他のページからのnavigate型が複雑化するため、
// 各コンポーネント側で useSearch({ strict: false }) で読み取り、未指定時はデフォルトを当てる。
const homeRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: "/",
  component: HomePage,
});

const favoritesRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: "/favorites",
  component: FavoritesPage,
});

const settingsRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: "/settings",
  component: SettingsPage,
});

const folderRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: "/folder/$authorEn/$titleEn",
  component: FolderPage,
});

const routeTree = rootRoute.addChildren([
  loginRoute,
  viewerRoute,
  authedRoute.addChildren([homeRoute, favoritesRoute, settingsRoute, folderRoute]),
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
