import { NextResponse } from "next/server";
import { DEMO_USERS, SESSION_COOKIE, createSessionToken, getCurrentUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ user: await getCurrentUser(), users: DEMO_USERS });
}

export async function POST(request: Request) {
  const body = (await request.json()) as { userId?: string };
  const user = DEMO_USERS.find((candidate) => candidate.id === body.userId);
  if (!user) return Response.json({ error: "Unknown demo user" }, { status: 400 });
  const token = await createSessionToken(user.id);
  const response = NextResponse.json({ user });
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return response;
}
