import "server-only";

import { notFound, redirect } from "next/navigation";
import { loadServerConfig } from "./server-config";
import { calendarDate, viewFilters, type SearchParams } from "./view-filters";
import { readWorkspaceContext } from "./workspace-context";
import { WORKSPACE_ID } from "./workspace-gateway";

export const statuses = {
  draft: "Borrador",
  pending: "Pendiente",
  confirmed: "Confirmada",
  reconciled: "Conciliada",
  voided: "Anulada",
};
export const types = {
  income: "Ingreso",
  expense: "Gasto",
  adjustment: "Ajuste",
  refund: "Reembolso",
  debt_payment: "Pago de deuda",
  fund_contribution: "Aporte a fondo",
};
const id = (value: unknown): value is string =>
  typeof value === "string" && WORKSPACE_ID.test(value);
const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;
const text = (value: unknown) =>
  typeof value === "string" ? value : undefined;
const keys = (value: unknown) => (Array.isArray(value) ? value.filter(id) : []);
const badRequest = Symbol("bad-request");

export function ledgerFilters(input: SearchParams) {
  const filters = viewFilters(input, {
    accountId: id,
    categoryId: id,
    from: calendarDate,
    to: calendarDate,
    status: (s) => Object.hasOwn(statuses, s),
    query: (s) => !s.includes("\0") && [...s].length <= 200,
  });
  if (!filters) return null;
  const from = filters.get("from"),
    to = filters.get("to");
  return from && to && from > to ? null : filters;
}

function amount(value: unknown) {
  if (!object(value)) return null;
  const { amountMinor, currency } = value;
  return typeof amountMinor === "string" &&
    /^-?\d+$/.test(amountMinor) &&
    typeof currency === "string" &&
    /^[A-Z]{3}$/.test(currency)
    ? { amountMinor, currency }
    : null;
}

function transaction(value: unknown) {
  if (!object(value)) return null;
  const { id: key, accountId, type, status, occurredAt } = value;
  const native = amount(value.amount);
  if (
    !id(key) ||
    !id(accountId) ||
    !native ||
    typeof occurredAt !== "string" ||
    !Number.isFinite(Date.parse(occurredAt)) ||
    typeof status !== "string" ||
    !Object.hasOwn(statuses, status) ||
    typeof type !== "string" ||
    !Object.hasOwn(types, type)
  )
    return null;
  return {
    id: key,
    accountId,
    amount: native,
    occurredAt,
    type: types[type as keyof typeof types],
    status: statuses[status as keyof typeof statuses],
    categoryId: text(value.categoryId),
    payeeId: text(value.payeeId),
    tagIds: keys(value.tagIds),
    description: text(value.description),
    notes: text(value.notes),
    splits: Array.isArray(value.splits)
      ? value.splits.flatMap((split: unknown) => {
          if (!object(split) || !id(split.categoryId)) return [];
          const money = amount(split.amount);
          return money
            ? [
                {
                  amount: money,
                  categoryId: split.categoryId,
                  notes: text(split.notes),
                  tagIds: keys(split.tagIds),
                },
              ]
            : [];
        })
      : [],
  };
}

function parsePage<T>(body: unknown, parse: (item: unknown) => T | null) {
  if (!object(body) || !Array.isArray(body.items) || !object(body.pageInfo))
    return null;
  const { hasNextPage, nextCursor } = body.pageInfo;
  if (
    typeof hasNextPage !== "boolean" ||
    (hasNextPage && (typeof nextCursor !== "string" || !nextCursor))
  )
    return null;
  const items = (body.items as unknown[]).map(parse);
  if (items.some((item) => item === null)) return null;
  return {
    items: items.filter((item) => item !== null),
    cursor: hasNextPage ? (nextCursor as string) : null,
  };
}

export async function ledgerScope(token: string) {
  const scope = await readWorkspaceContext(token);
  if (scope.kind === "unauthenticated") redirect("/sign-in");
  if (scope.kind !== "ok" || !scope.active) return null;
  const { id: workspaceId, name } = scope.active;
  async function read(route: string, detail = false): Promise<unknown> {
    let response: Response;
    try {
      const base = loadServerConfig().backendBaseUrl.href.replace(/\/?$/, "/");
      response = await fetch(new URL(`v1/${route}`, base).href, {
        cache: "no-store",
        redirect: "manual",
        headers: {
          authorization: `Bearer ${token}`,
          accept: "application/json",
          "x-workspace-id": workspaceId,
        },
      });
    } catch {
      return null;
    }
    if (response.status === 401) redirect("/sign-in");
    if (detail && response.status === 404) notFound();
    if (response.status === 400) return badRequest;
    if (response.status !== 200) return null;
    return response.json().catch(() => null);
  }
  async function catalog(route: string) {
    const query = new URLSearchParams({ limit: "200" });
    const names = new Map<string, string>();
    const seen = new Set<string>();
    for (;;) {
      const page = parsePage(await read(`${route}?${query}`), (item) =>
        object(item) && id(item.id) && typeof item.name === "string"
          ? { id: item.id, name: item.name }
          : null,
      );
      if (!page) return null;
      for (const { id, name } of page.items) names.set(id, name);
      if (!page.cursor) return names;
      if (seen.has(page.cursor)) return null;
      seen.add(page.cursor);
      query.set("cursor", page.cursor);
    }
  }
  return {
    name,
    async listTransactions(filters: URLSearchParams) {
      const body = await read(
        `transactions?limit=20${filters.size ? `&${filters}` : ""}`,
      );
      return body === badRequest
        ? ("invalid-filters" as const)
        : parsePage(body, transaction);
    },
    async getTransaction(key: string) {
      if (!id(key)) notFound();
      const row = transaction(await read(`transactions/${key}`, true));
      return row?.id === key ? row : null;
    },
    async lookups() {
      const [accounts, categories, payees, tags] = await Promise.all(
        ["accounts", "categories", "payees", "tags"].map(catalog),
      );
      return accounts && categories && payees && tags
        ? { accounts, categories, payees, tags }
        : null;
    },
  };
}

type Scope = NonNullable<Awaited<ReturnType<typeof ledgerScope>>>;
export type LedgerLabels = NonNullable<Awaited<ReturnType<Scope["lookups"]>>>;
export type LedgerRow = NonNullable<ReturnType<typeof transaction>>;
