import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { SignJWT, jwtVerify } from "jose";
import type { Request, Response } from "express";

export const LOCAL_SESSION_COOKIE = "upside_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 dias

function getSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret && process.env.NODE_ENV === "production") {
    throw new Error("JWT_SECRET é obrigatório em produção");
  }
  return new TextEncoder().encode(secret ?? "apsy-local-development-only");
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

export type LocalSession = {
  uid: number;
  username: string;
  name: string;
  role: "admin" | "analista" | "cliente";
};

export async function signSession(session: LocalSession): Promise<string> {
  return await new SignJWT(session as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(getSecret());
}

export async function verifySessionToken(token: string): Promise<LocalSession | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (!payload.uid || !payload.username) return null;
    return {
      uid: payload.uid as number,
      username: payload.username as string,
      name: (payload.name as string) ?? "",
      role: (payload.role as LocalSession["role"]) ?? "cliente",
    };
  } catch {
    return null;
  }
}

export function parseSessionCookie(req: Request): string | null {
  const raw = req.headers.cookie;
  if (!raw) return null;
  const parts = raw.split(";").map(p => p.trim());
  for (const part of parts) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    if (part.slice(0, idx) === LOCAL_SESSION_COOKIE) {
      return decodeURIComponent(part.slice(idx + 1));
    }
  }
  return null;
}

export async function getLocalSession(req: Request): Promise<LocalSession | null> {
  const token = parseSessionCookie(req);
  if (!token) return null;
  return await verifySessionToken(token);
}

export function setSessionCookie(req: Request, res: Response, token: string) {
  const secure = req.protocol === "https" || (req.headers["x-forwarded-proto"] as string) === "https";
  res.cookie(LOCAL_SESSION_COOKIE, token, {
    httpOnly: true,
    secure,
    sameSite: secure ? "none" : "lax",
    maxAge: SESSION_TTL_SECONDS * 1000,
    path: "/",
  });
}

export function clearSessionCookie(req: Request, res: Response) {
  const secure = req.protocol === "https" || (req.headers["x-forwarded-proto"] as string) === "https";
  res.cookie(LOCAL_SESSION_COOKIE, "", {
    httpOnly: true,
    secure,
    sameSite: secure ? "none" : "lax",
    maxAge: -1,
    path: "/",
  });
}
