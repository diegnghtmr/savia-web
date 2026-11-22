import "server-only";

import {
  ACCOUNT_STATUSES,
  ACCOUNT_TYPES,
  ACCOUNT_TEXT,
  informalDebtDetails,
  type AccountDraft,
  type AccountType,
  type AccountStatus,
} from "./account-types";
import { loadServerConfig } from "./server-config";
import { readWorkspaceContext } from "./workspace-context";
import { WORKSPACE_ID } from "./workspace-gateway";

type Target = {
  accessToken: string;
  workspaceId: string;
  fetchImpl?: typeof fetch;
};
type Result<T> =
  | { kind: "ok"; value: T }
  | { kind: "unauthenticated" }
  | { kind: "failed"; status?: number };
const failed = { kind: "failed" } as const;
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;
function accountInformalDetails(type: unknown, value: unknown) {
  return type === "informal_debt" && record(value)
    ? informalDebtDetails(value.counterpartyName, value.direction)
    : null;
}

export async function accountScope(accessToken: string) {
  const context = await readWorkspaceContext(accessToken);
  if (context.kind !== "ok") return context;
  if (!context.active) return { kind: "empty" } as const;
  const { id: workspaceId, name } = context.active;
  return { kind: "ok", name, target: { accessToken, workspaceId } } as const;
}

async function request<T>(
  target: Target,
  suffix: string,
  parse: (body: unknown, response: Response) => T | null,
  expected = 200,
  init: RequestInit = {},
): Promise<Result<T>> {
  try {
    const base = loadServerConfig().backendBaseUrl.href.replace(/\/?$/, "/");
    const response = await (target.fetchImpl ?? fetch)(
      new URL(`v1/accounts${suffix}`, base).href,
      {
        ...init,
        cache: "no-store",
        redirect: "manual",
        headers: {
          ...init.headers,
          authorization: `Bearer ${target.accessToken}`,
          accept: "application/json",
          "x-workspace-id": target.workspaceId,
        },
      },
    );
    if (response.status === 401) return { kind: "unauthenticated" };
    if (response.status !== expected)
      return { kind: "failed", status: response.status };
    const value = parse(await response.json(), response);
    return value === null ? failed : { kind: "ok", value };
  } catch {
    return failed;
  }
}

export function listAccounts(
  target: Target,
  status?: AccountStatus,
  cursor?: string,
  limit = "20",
) {
  const query = new URLSearchParams({ limit });
  if (status) query.set("status", status);
  if (cursor) query.set("cursor", cursor);
  return request(target, `?${query}`, (body) => {
    if (!record(body) || !Array.isArray(body.items) || !record(body.pageInfo))
      return null;
    const { hasNextPage, nextCursor } = body.pageInfo;
    if (
      typeof hasNextPage !== "boolean" ||
      (hasNextPage && (typeof nextCursor !== "string" || !nextCursor))
    )
      return null;
    const items = [];
    for (const item of body.items as unknown[]) {
      if (!record(item)) return null;
      const { id, name, status, type } = item;
      if (
        typeof id !== "string" ||
        !WORKSPACE_ID.test(id) ||
        typeof name !== "string" ||
        !name.trim() ||
        typeof status !== "string" ||
        !Object.hasOwn(ACCOUNT_STATUSES, status)
      )
        return null;
      items.push({
        id,
        name,
        status: status as AccountStatus,
        type:
          typeof type === "string" && Object.hasOwn(ACCOUNT_TYPES, type)
            ? (type as AccountType)
            : null,
        informalDebt: accountInformalDetails(type, item.informalDebt),
      });
    }
    return { items, nextCursor: hasNextPage ? (nextCursor as string) : null };
  });
}

export const ACCOUNT_ETAG = /^"[1-9]\d{0,9}"$/;

export function getAccount(target: Target, id: string) {
  return request(target, `/${id}`, (body, response) => {
    const etag = response.headers.get("etag");
    if (
      !record(body) ||
      typeof body.id !== "string" ||
      body.id.toLowerCase() !== id ||
      !etag ||
      !ACCOUNT_ETAG.test(etag)
    )
      return null;
    const { name, type, currency, status, includeInNetWorth } = body;
    if (
      typeof name !== "string" ||
      !name.trim() ||
      typeof type !== "string" ||
      !Object.hasOwn(ACCOUNT_TYPES, type) ||
      typeof currency !== "string" ||
      !/^[A-Z]{3}$/.test(currency) ||
      typeof status !== "string" ||
      !Object.hasOwn(ACCOUNT_STATUSES, status) ||
      typeof includeInNetWorth !== "boolean"
    )
      return null;
    const text = (field: (typeof ACCOUNT_TEXT)[number][0]) =>
      typeof body[field] === "string" ? body[field] : "";
    return {
      name,
      type: type as AccountType,
      informalDebt: accountInformalDetails(type, body.informalDebt),
      currency,
      etag,
      status: status as AccountStatus,
      includeInNetWorth: String(includeInNetWorth),
      institution: text("institution"),
      maskedNumber: text("maskedNumber"),
      description: text("description"),
    };
  });
}

function parseMoney(body: unknown) {
  if (!record(body)) return null;
  const { amountMinor, currency } = body;
  return typeof amountMinor === "string" &&
    /^-?\d+$/.test(amountMinor) &&
    typeof currency === "string" &&
    /^[A-Z]{3}$/.test(currency)
    ? { amountMinor, currency }
    : null;
}

function parseEquivalent(body: unknown) {
  if (!record(body)) return null;
  const { rate, rateDate, rateSource } = body;
  const converted = parseMoney(body.converted);
  return converted &&
    typeof rate === "string" &&
    /^\d+(\.\d+)?$/.test(rate) &&
    typeof rateDate === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(rateDate) &&
    typeof rateSource === "string"
    ? { converted, rate, rateDate, rateSource }
    : null;
}

export function getAccountBalance(target: Target, id: string) {
  const canonical = id.toLowerCase();
  return request(target, `/${canonical}/balance`, (body) => {
    if (
      !record(body) ||
      typeof body.accountId !== "string" ||
      body.accountId.toLowerCase() !== canonical ||
      typeof body.asOf !== "string" ||
      !Number.isFinite(Date.parse(body.asOf))
    )
      return null;
    const native = parseMoney(body.nativeBalance);
    if (!native) return null;
    return {
      ...native,
      asOf: body.asOf,
      pending: parseMoney(body.pendingBalance),
      available: parseMoney(body.availableBalance),
      reconciled: parseMoney(body.reconciledBalance),
      equivalent: parseEquivalent(body.baseCurrencyEquivalent),
    };
  });
}

export function updateAccount(
  target: Target,
  id: string,
  etag: string,
  draft: Record<string, string | boolean | null>,
) {
  return request(
    target,
    `/${id}`,
    (body) => (record(body) && body.id === id ? true : null),
    200,
    {
      method: "PATCH",
      headers: { "if-match": etag, "content-type": "application/json" },
      body: JSON.stringify(draft),
    },
  );
}

export function closeAccount(
  target: Target,
  id: string,
  etag: string,
  key: string,
) {
  return request(
    target,
    `/${id}/close`,
    (body) =>
      record(body) && body.id === id && body.status === "closed" ? true : null,
    200,
    {
      method: "POST",
      headers: { "if-match": etag, "idempotency-key": key },
    },
  );
}

export function createAccount(
  target: Target,
  draft: AccountDraft,
  key: string,
) {
  return request(
    target,
    "",
    (body) =>
      record(body) && typeof body.id === "string" && WORKSPACE_ID.test(body.id)
        ? body.id
        : null,
    201,
    {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": key },
      body: JSON.stringify(draft),
    },
  );
}
