import { NextResponse } from "next/server";

export function proxy() {
  // Admission and cookie state belong to the verified form action, not its URL.
  const response = NextResponse.next();
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = {
  matcher: [
    "/transactions/:id",
    "/transfers",
    "/exchange-rates",
    "/budgets/new",
    "/budgets/:id/edit/:version",
    "/funds/new",
    "/funds/:id/contribute",
    "/debts/:id/pay",
  ],
};
