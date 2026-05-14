import type { Request, Response } from "express";
import { readAuthCookie } from "./auth.js";
import { prisma } from "./db.js";

export interface GraphQLContext {
  req: Request;
  res: Response;
  userId: number | null;
  prisma: typeof prisma;
}

export async function buildContext({
  req,
  res,
}: {
  req: Request;
  res: Response;
}): Promise<GraphQLContext> {
  const payload = readAuthCookie(req);
  return {
    req,
    res,
    userId: payload?.uid ?? null,
    prisma,
  };
}

export function requireUser(ctx: GraphQLContext): number {
  if (!ctx.userId) {
    throw new Error("UNAUTHENTICATED");
  }
  return ctx.userId;
}
