import "server-only";

import {
  ACCOUNT_STATUSES,
  type AccountDraft,
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
  | { kind: "failed" };
const failed = { kind: "failed" } as const;
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

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
  parse: (body: unknown) => T | null,
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
    if (response.status !== expected) return failed;
    const value = parse(await response.json());
    return value === null ? failed : { kind: "ok", value };
  } catch {
    return failed;
  }
}

export function listAccounts(
  target: Target,
  status?: AccountStatus,
  cursor?: string,
) {
  const query = new URLSearchParams({ limit: "20" });
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
      const { id, name, status } = item;
      if (
        typeof id !== "string" ||
        !WORKSPACE_ID.test(id) ||
        typeof name !== "string" ||
        !name.trim() ||
        typeof status !== "string" ||
        !Object.hasOwn(ACCOUNT_STATUSES, status)
      )
        return null;
      items.push({ id, name, status: status as AccountStatus });
    }
    return { items, nextCursor: hasNextPage ? (nextCursor as string) : null };
  });
}

export function getAccountBalance(target: Target, id: string) {
  return request(target, `/${id}/balance`, (body) => {
    if (
      !record(body) ||
      body.accountId !== id ||
      !record(body.nativeBalance) ||
      typeof body.asOf !== "string" ||
      !Number.isFinite(Date.parse(body.asOf))
    )
      return null;
    const { amountMinor, currency } = body.nativeBalance;
    if (
      typeof amountMinor !== "string" ||
      !/^-?\d+$/.test(amountMinor) ||
      typeof currency !== "string" ||
      !/^[A-Z]{3}$/.test(currency)
    )
      return null;
    return { amountMinor, currency, asOf: body.asOf };
  });
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
