import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import type { Request, Response } from "express";

const JWT_SECRET = process.env.ADMIN_JWT_SECRET ?? "admin-dev-secret-change-me";
const JWT_EXPIRES_IN = process.env.ADMIN_JWT_EXPIRES_IN ?? "1d";
// 一般ユーザー側 (zc_token) と必ず別の Cookie 名にする
const COOKIE_NAME = "zc_admin_token";

export interface JwtPayload {
  adminId: number;
  name?: string | null;
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN as any });
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JwtPayload;
  } catch {
    return null;
  }
}

export function setAuthCookie(res: Response, token: string) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE === "true",
    sameSite: "lax",
    domain: process.env.COOKIE_DOMAIN || undefined,
    maxAge: 24 * 60 * 60 * 1000, // 1 day（管理側は短め）
    path: "/",
  });
}

export function clearAuthCookie(res: Response) {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE === "true",
    sameSite: "lax",
    domain: process.env.COOKIE_DOMAIN || undefined,
    path: "/",
  });
}

export function readAuthCookie(req: Request): JwtPayload | null {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return null;
  return verifyToken(token);
}

/**
 * tb_adm.adm_vch1 は平文 or bcrypt の可能性あり。
 * 初回ログイン時に平文 → bcrypt へ自動マイグレーション。
 */
export async function verifyAndMaybeMigratePassword(
  stored: string | null | undefined,
  given: string,
  onMigrate: (newHash: string) => Promise<void>
): Promise<boolean> {
  if (!stored) return false;
  if (stored.startsWith("$2")) {
    return bcrypt.compare(given, stored);
  }
  if (stored !== given) return false;
  const newHash = await bcrypt.hash(given, 10);
  await onMigrate(newHash);
  return true;
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}
