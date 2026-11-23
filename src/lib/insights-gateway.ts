import "server-only";

import { redirect } from "next/navigation";
import type { InsightsPeriod } from "./insights-period";
import { loadServerConfig } from "./server-config";
import { amount } from "./transactions-gateway";
import type { readWorkspaceContext } from "./workspace-context";

type Workspace = NonNullable<
  Extract<
    Awaited<ReturnType<typeof readWorkspaceContext>>,
    { kind: "ok" }
  >["active"]
>;

type InsightsRequest = (
  route: string,
  query?: URLSearchParams,
  init?: RequestInit,
) => Promise<Response | null>;

export function insightsTransport(token: string): InsightsRequest;
export function insightsTransport(
  token: string,
  workspace: Workspace,
): InsightsRequest;
export function insightsTransport(
  token: string,
  workspace?: Workspace,
): InsightsRequest {
  return async (route: string, query?: URLSearchParams, init?: RequestInit) => {
    let response: Response;
    try {
      const base = loadServerConfig().backendBaseUrl.href.replace(/\/?$/, "/");
      const url = new URL(`v1/${route}`, base);
      if (query) url.search = query.toString();
      response = await fetch(url.href, {
        ...init,
        cache: "no-store",
        redirect: "manual",
        headers: {
          accept: "application/json",
          ...init?.headers,
          authorization: `Bearer ${token}`,
          ...(workspace && { "x-workspace-id": workspace.id }),
        },
      });
    } catch {
      return null;
    }
    if (response.status === 401) redirect("/sign-in");
    return response;
  };
}

export function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function baseAmount(value: unknown, currency: string) {
  const parsed = amount(value);
  return parsed?.currency === currency ? parsed : null;
}

export async function readSummary(
  token: string,
  workspace: Workspace,
  period: InsightsPeriod,
  signal?: AbortSignal,
) {
  if (!workspace.baseCurrency) return null;
  const response = await insightsTransport(token, workspace)(
    "analytics/summary",
    new URLSearchParams(period),
    signal ? { signal } : undefined,
  );
  if (response?.status !== 200) return null;
  const body = record(await response.json().catch(() => null));
  if (
    !body ||
    body.periodStart !== period.from ||
    body.periodEnd !== period.to ||
    body.baseCurrency !== workspace.baseCurrency
  )
    return null;
  const netWorth = baseAmount(body.netWorth, body.baseCurrency);
  const income = baseAmount(body.income, body.baseCurrency);
  const expenses = baseAmount(body.expenses, body.baseCurrency);
  const netFlow = baseAmount(body.savingsCapacity, body.baseCurrency);
  if (!netWorth || !income || !expenses || !netFlow) return null;
  const percent = body.budgetUtilizationPercent;
  return {
    netWorth,
    income,
    expenses,
    netFlow,
    budgetUse:
      typeof percent === "number" && Number.isFinite(percent) ? percent : null,
  };
}
