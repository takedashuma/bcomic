import { jsx as _jsx } from "react/jsx-runtime";
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
    component: () => _jsx(Outlet, {}),
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
// 一覧系ルートは search params (page, q) を URL に反映して
// ブラウザ戻る時に元のページ・検索条件を復元できるようにする
const listSearchSchema = (s) => ({
    page: typeof s.page === "string" ? Math.max(1, Number(s.page) || 1) : s.page || 1,
    q: typeof s.q === "string" ? s.q : "",
});
const homeRoute = createRoute({
    getParentRoute: () => authedRoute,
    path: "/",
    component: HomePage,
    validateSearch: listSearchSchema,
});
const favoritesRoute = createRoute({
    getParentRoute: () => authedRoute,
    path: "/favorites",
    component: FavoritesPage,
    validateSearch: listSearchSchema,
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
