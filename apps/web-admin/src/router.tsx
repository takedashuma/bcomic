import { Outlet, createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import { AppLayout } from "./components/AppLayout";
import { LoginPage } from "./routes/login";
import { HomePage } from "./routes/home";
import { UnknownPage } from "./routes/unknown";
import { CompareNormalPage } from "./routes/compare-normal";
import { CompareEroPage } from "./routes/compare-ero";
import { SearchPagePage } from "./routes/search-page";

const rootRoute = createRootRoute({ component: () => <Outlet /> });

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  component: LoginPage,
});

const authedRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "admin-authed",
  component: AppLayout,
});

const homeRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: "/",
  component: HomePage,
});
const unknownRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: "/unknown",
  component: UnknownPage,
});
const compareNormalRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: "/compare-normal",
  component: CompareNormalPage,
});
const compareEroRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: "/compare-ero",
  component: CompareEroPage,
});
const searchPageRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: "/search-page",
  component: SearchPagePage,
});

const routeTree = rootRoute.addChildren([
  loginRoute,
  authedRoute.addChildren([
    homeRoute,
    unknownRoute,
    compareNormalRoute,
    compareEroRoute,
    searchPageRoute,
  ]),
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
