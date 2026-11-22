import "server-only";

import { cursorWorkspace } from "./funds-gateway";
import { amount, ledgerScope, parsePage } from "./transactions-gateway";
import { calendarDate, viewFilters, type SearchParams } from "./view-filters";
import { WORKSPACE_ID } from "./workspace-gateway";
import { scanWorkspacePages } from "./workspace-page-scan";

const statuses = {
  active: "Activa",
  paid: "Pagada",
  defaulted: "En mora",
  archived: "Archivada",
};
export const debtId = (value: unknown): value is string =>
  typeof value === "string" && WORKSPACE_ID.test(value);

export function debtFilters(input: SearchParams) {
  if (Object.keys(input).some((name) => name !== "cursor" && name !== "limit"))
    return null;
  const query = viewFilters(input, {});
  const cursor = query?.get("cursor"),
    workspace = cursor ? cursorWorkspace(cursor) : null;
  return query && (!cursor || workspace) ? { query, workspace } : null;
}

export const debtMoney = (input: unknown, currency: unknown) => {
  const parsed = amount(input);
  return parsed && parsed.currency === currency ? parsed : null;
};

function parseDebt(input: unknown) {
  if (!input || typeof input !== "object") return null;
  const {
    id,
    name,
    currency,
    status,
    annualRate,
    outstandingBalance,
    principal,
    minimumPayment,
    rateType,
    nextPaymentAt,
  } = input as Record<string, unknown>;
  const balance = debtMoney(outstandingBalance, currency),
    capital = debtMoney(principal, currency),
    minimum = debtMoney(minimumPayment, currency);
  if (
    !debtId(id) ||
    typeof name !== "string" ||
    !name.trim() ||
    typeof status !== "string" ||
    !Object.hasOwn(statuses, status) ||
    typeof annualRate !== "string" ||
    !/^\d+(?:\.\d+)?$/.test(annualRate) ||
    !balance ||
    !capital ||
    (minimumPayment != null && !minimum) ||
    (rateType != null && rateType !== "fixed" && rateType !== "variable") ||
    (nextPaymentAt != null &&
      (typeof nextPaymentAt !== "string" || !calendarDate(nextPaymentAt)))
  )
    return null;
  // Shift the decimal string by two places without rounding the API's rate.
  const [whole, fraction = ""] = annualRate.split(".");
  const percent = (whole + fraction.padEnd(2, "0").slice(0, 2)).replace(
      /^0+(?=\d)/,
      "",
    ),
    decimals = fraction.slice(2).replace(/0+$/, "");
  return {
    id: id.toLowerCase(),
    name,
    currency: balance.currency,
    balance,
    capital,
    minimum,
    rateType,
    nextPaymentAt,
    status: statuses[status as keyof typeof statuses],
    annualRate: `${percent}${decimals ? `,${decimals}` : ""} %`,
  };
}
export type Debt = NonNullable<ReturnType<typeof parseDebt>>;

export async function debtScope(token: string) {
  const scope = await ledgerScope(token);
  if (!scope) return null;
  const list = async (query: URLSearchParams, signal?: AbortSignal) => {
    const response = await scope.request(
      `debts${query.size ? `?${query}` : ""}`,
      signal ? { signal } : undefined,
    );
    if (response?.status === 400) return "invalid-filters" as const;
    if (!response?.ok) return null;
    const page = parsePage(await response.json().catch(() => null), parseDebt);
    if (
      !page ||
      (page.cursor &&
        (!page.items.length ||
          page.cursor === query.get("cursor") ||
          cursorWorkspace(page.cursor) !== scope.workspaceId))
    )
      return null;
    return page;
  };
  return {
    ...scope,
    list,
    detail: (id: string) => scanWorkspacePages(id, list),
  };
}
