import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

/**
 * すべての環境依存値は .env から読み取る。
 *   VITE_DEV_API_PROXY  = vite dev サーバが /graphql /img をプロキシするAPIのURL
 *                        (例: http://localhost:4000)
 *   VITE_DEV_PORT       = vite dev サーバのポート (デフォルト 5173)
 *   VITE_API_URL        = フロントが本番ビルド時に使うAPIベースURL（空文字推奨=相対URL）
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, path.resolve(__dirname, "../.."), "");
  const devApiProxy = env.VITE_DEV_API_PROXY || "http://localhost:4000";
  const devPort = Number(env.VITE_DEV_PORT) || 5173;

  return {
    plugins: [react()],
    resolve: {
      alias: { "@": path.resolve(__dirname, "src") },
    },
    server: {
      port: devPort,
      proxy: {
        "/graphql": devApiProxy,
        "/img": devApiProxy,
        "/docs": devApiProxy,
        "/openapi.yaml": devApiProxy,
        "/openapi.json": devApiProxy,
      },
    },
  };
});
