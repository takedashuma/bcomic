import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { ApolloServer } from "@apollo/server";
import { expressMiddleware } from "@as-integrations/express4";
import { makeExecutableSchema } from "@graphql-tools/schema";
import { typeDefs } from "./schema/typeDefs.js";
import { resolvers } from "./schema/resolvers.js";
import { buildContext, type AdminContext } from "./context.js";

async function main() {
  const app = express();

  const origins = (process.env.ADMIN_CORS_ORIGINS ?? "http://localhost:5174,http://localhost:8081")
    .split(",")
    .map((s) => s.trim());
  app.use(cors({ origin: origins, credentials: true }));
  app.use(cookieParser());

  app.get("/healthz", (_req, res) => {
    res.json({ ok: true, ts: new Date().toISOString(), role: "admin" });
  });

  const schema = makeExecutableSchema({ typeDefs, resolvers });
  const apollo = new ApolloServer<AdminContext>({ schema });
  await apollo.start();

  app.use(
    "/graphql",
    // 重い同期ジョブを許容するためボディ上限を引き上げ
    express.json({ limit: "5mb" }),
    expressMiddleware(apollo, {
      context: async ({ req, res }) => buildContext({ req, res }),
    })
  );

  const port = Number(process.env.ADMIN_PORT ?? 4001);
  app.listen(port, () => {
    console.log(`[zcomic-api-admin] listening on :${port}`);
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
