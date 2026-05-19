import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

/**
 * web-admin。本サイト(web) と完全に分離した独自ビルド。
 * .env から:
 *   VITE_ADMIN_API_URL         本番ビルド時のAPIベースURL（空文字=相対）
 *   VITE_ADMIN_DEV_API_PROXY   dev サーバのプロキシ先
 *   VITE_ADMIN_DEV_PORT        dev サーバのポート (デフォルト 5174)
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, path.resolve(__dirname, "../.."), "");
  const devApiProxy = env.VITE_ADMIN_DEV_API_PROXY || "http://localhost:4001";
  const devPort = Number(env.VITE_ADMIN_DEV_PORT) || 5174;

  return {
    plugins: [react()],
    resolve: { alias: { "@": path.resolve(__dirname, "src") } },
    server: {
      port: devPort,
      proxy: {
        "/graphql": devApiProxy,
      },
    },
  };
});
