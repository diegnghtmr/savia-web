import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { draftCookieOptions, draftSeedCookie } from "@/lib/draft-cookie";

export function proxy(request: NextRequest) {
  const response = NextResponse.next();
  // Deliver the browser seed on the form GET, before any mutation can commit.
  if (request.method === "GET" && !request.cookies.has(draftSeedCookie))
    response.cookies.set(draftSeedCookie, randomUUID(), {
      ...draftCookieOptions,
      path: "/",
    });
  return response;
}

export const config = {
  matcher: [
    "/transactions/new",
    "/transfers",
    "/exchange-rates",
    "/budgets/new",
    "/budgets/:id/edit/:version",
  ],
};
