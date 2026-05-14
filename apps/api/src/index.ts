import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { ApolloServer } from "@apollo/server";
import { expressMiddleware } from "@as-integrations/express4";
import { makeExecutableSchema } from "@graphql-tools/schema";
import swaggerUi from "swagger-ui-express";
import YAML from "yaml";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { typeDefs } from "./schema/typeDefs.js";
import { resolvers } from "./schema/resolvers.js";
import { buildContext, type GraphQLContext } from "./context.js";
import imageRouter from "./routes/images.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const app = express();

  // CORS: 開発時の Vite (5173) と本番 web (8080) を両方許可
  const origins = (process.env.CORS_ORIGINS ?? "http://localhost:5173,http://localhost:8080")
    .split(",")
    .map((s) => s.trim());
  app.use(
    cors({
      origin: origins,
      credentials: true,
    })
  );

  app.use(cookieParser());

  // ヘルスチェック
  app.get("/healthz", (_req, res) => {
    res.json({ ok: true, ts: new Date().toISOString() });
  });

  // Swagger UI (/docs)
  try {
    const yamlPath = path.resolve(__dirname, "../openapi.yaml");
    const openapiText = fs.readFileSync(yamlPath, "utf8");
    const openapiSpec = YAML.parse(openapiText);
    app.use(
      "/docs",
      swaggerUi.serve,
      swaggerUi.setup(openapiSpec, {
        customSiteTitle: "zcomic-next API",
        swaggerOptions: { persistAuthorization: true },
      })
    );
    // 生のYAMLを取得できるようにしておく（外部ツール連携用）
    app.get("/openapi.yaml", (_req, res) => {
      res.type("text/yaml").send(openapiText);
    });
    app.get("/openapi.json", (_req, res) => {
      res.json(openapiSpec);
    });
    console.log("[zcomic-api] Swagger UI mounted at /docs");
  } catch (e) {
    console.warn("[zcomic-api] failed to load openapi.yaml — Swagger UI disabled", e);
  }

  // 画像配信エンドポイント
  app.use("/img", imageRouter);

  const schema = makeExecutableSchema({ typeDefs, resolvers });
  const apollo = new ApolloServer<GraphQLContext>({ schema });
  await apollo.start();

  app.use(
    "/graphql",
    express.json({ limit: "1mb" }),
    expressMiddleware(apollo, {
      context: async ({ req, res }) => buildContext({ req, res }),
    })
  );

  const port = Number(process.env.PORT ?? 4000);
  app.listen(port, () => {
    console.log(`[zcomic-api] listening on :${port}`);
    console.log(`[zcomic-api] COMIC_ROOT = ${process.env.COMIC_ROOT ?? "/comics"}`);
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
