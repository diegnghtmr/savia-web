import "server-only";

import { amount, ledgerScope, parsePage } from "./transactions-gateway";
import { calendarDate, viewFilters, type SearchParams } from "./view-filters";
import { WORKSPACE_ID } from "./workspace-gateway";
import { scanWorkspacePages } from "./workspace-page-scan";

const statuses = {
  active: "Activo",
  completed: "Completado",
  paused: "En pausa",
  archived: "Archivado",
};
export const fundId = (id: unknown): id is string =>
  typeof id === "string" && WORKSPACE_ID.test(id);

export function cursorWorkspace(token: string) {
  if (!/^[\w-]{1,256}$/.test(token)) return null;
  try {
    const bytes = Buffer.from(token, "base64url");
    const json = bytes.toString();
    const value: unknown = JSON.parse(json);
    if (
      token !== bytes.toString("base64url") ||
      !Array.isArray(value) ||
      value.length !== 3 ||
      json !== JSON.stringify(value)
    )
      return null;
    const [workspace, time, id] = value;
    return fundId(workspace) &&
      fundId(id) &&
      typeof time === "string" &&
      /^(?!0000)\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(time) &&
      new Date(time).toJSON()?.slice(0, 23) === time.slice(0, 23)
      ? workspace
      : null;
  } catch {
    return null;
  }
}

export function fundFilters(input: SearchParams) {
  if (Object.keys(input).some((key) => key !== "cursor" && key !== "limit"))
    return null;
  const filters = viewFilters(input, {});
  const cursor = filters?.get("cursor");
  const workspace = cursor ? cursorWorkspace(cursor) : null;
  return filters && (!cursor || workspace) ? { filters, workspace } : null;
}

function fund(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const {
    id,
    name,
    currency,
    status,
    targetDate,
    targetAmount,
    currentAmount,
    recommendedMonthlyContribution,
  } = value as Record<string, unknown>;
  const target = amount(targetAmount),
    saved = amount(currentAmount),
    recommended = amount(recommendedMonthlyContribution);
  if (
    !fundId(id) ||
    typeof name !== "string" ||
    typeof status !== "string" ||
    !Object.hasOwn(statuses, status) ||
    !target ||
    !saved ||
    target.currency !== currency ||
    saved.currency !== currency ||
    BigInt(target.amountMinor) <= BigInt(0) ||
    (targetDate != null &&
      (typeof targetDate !== "string" || !calendarDate(targetDate)))
  )
    return null;
  return {
    id: id.toLowerCase(),
    name,
    currency: target.currency,
    status: statuses[status as keyof typeof statuses],
    targetDate,
    target,
    saved,
    recommended: recommended?.currency === currency ? recommended : null,
  };
}
export type Fund = NonNullable<ReturnType<typeof fund>>;

export async function fundScope(token: string) {
  const scope = await ledgerScope(token);
  if (!scope) return null;
  const list = async (query: URLSearchParams, signal?: AbortSignal) => {
    const response = await scope.request(
      `funds${query.size ? `?${query}` : ""}`,
      signal ? { signal } : undefined,
    );
    if (response?.status === 400) return "invalid-filters" as const;
    if (!response?.ok) return null;
    const page = parsePage(await response.json().catch(() => null), fund);
    return page &&
      (!page.cursor || cursorWorkspace(page.cursor) === scope.workspaceId)
      ? page
      : null;
  };
  return {
    ...scope,
    list,
    detail: (id: string) => scanWorkspacePages(id, list),
  };
}
