import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { sql } from "@/db/client";

export const SESSION_COOKIE = "corvo_session";
const secret = new TextEncoder().encode(
  process.env.AUTH_SECRET ?? "corvo-dev-secret-change-me",
);

export interface DemoUser {
  id: string;
  name: string;
  role: "REQUESTER" | "BUYER" | "ADMIN";
}

export const DEMO_USERS: DemoUser[] = [
  { id: "requester-asha", name: "Asha (Requester)", role: "REQUESTER" },
  { id: "buyer-ravi", name: "Ravi (Buyer)", role: "BUYER" },
  { id: "admin-meera", name: "Meera (Procurement Admin)", role: "ADMIN" },
];

export async function createSessionToken(userId: string): Promise<string> {
  return new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret);
}

export async function readSessionUserId(token: string | undefined): Promise<string | null> {
  if (!token) return null;
  try {
    const verified = await jwtVerify(token, secret);
    return typeof verified.payload.sub === "string" ? verified.payload.sub : null;
  } catch {
    return null;
  }
}

export async function getCurrentUser(): Promise<DemoUser> {
  let userId = DEMO_USERS[1].id;
  try {
    const store = await cookies();
    const parsed = await readSessionUserId(store.get(SESSION_COOKIE)?.value);
    if (parsed) userId = parsed;
  } catch {
    // cookies() is unavailable in a few build-time contexts; default to buyer.
  }
  const rows = await sql<{ id: string; name: string; role: string }[]>`
    SELECT id, name, role FROM users WHERE id = ${userId} LIMIT 1`;
  if (rows.length > 0) {
    return {
      id: rows[0].id,
      name: rows[0].name,
      role: rows[0].role as DemoUser["role"],
    };
  }
  return DEMO_USERS.find((user) => user.id === userId) ?? DEMO_USERS[1];
}

export function roleLabel(role: DemoUser["role"]): string {
  return role === "ADMIN" ? "Procurement Admin" : role === "BUYER" ? "Buyer" : "Requester";
}
