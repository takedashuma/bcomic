import type { Request, Response } from "express";
import { readAuthCookie } from "./auth.js";
import { prisma } from "./db.js";

export interface AdminContext {
  req: Request;
  res: Response;
  adminId: number | null;
  prisma: typeof prisma;
}

export async function buildContext({
  req,
  res,
}: {
  req: Request;
  res: Response;
}): Promise<AdminContext> {
  const payload = readAuthCookie(req);
  return {
    req,
    res,
    adminId: payload?.adminId ?? null,
    prisma,
  };
}

export function requireAdmin(ctx: AdminContext): number {
  if (!ctx.adminId) throw new Error("UNAUTHENTICATED");
  return ctx.adminId;
}
