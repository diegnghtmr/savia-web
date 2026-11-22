import "server-only";

import { notFound } from "next/navigation";
import { amount, ledgerScope, parsePage } from "./transactions-gateway";
import { calendarDate, viewFilters, type SearchParams } from "./view-filters";
import { WORKSPACE_ID } from "./workspace-gateway";

export const methods = {
  cash_flow: "Flujo de caja",
  zero_based: "Base cero",
  envelope: "Sobres",
  hybrid: "Híbrido",
};
export const rollover = {
  none: "Sin arrastre",
  surplus: "Arrastrar sobrante",
  deficit: "Arrastrar déficit",
  both: "Arrastrar ambos",
  to_savings: "Transferir a ahorro",
  to_fund: "Transferir a un fondo",
  to_category: "Transferir a otra categoría",
};
export function budgetFilters(input: SearchParams) {
  if (
    Object.keys(input).some(
      (key) => !["from", "to", "limit", "cursor"].includes(key),
    )
  )
    return null;
  const filters = viewFilters(input, { from: calendarDate, to: calendarDate });
  if (!filters) return null;
  const from = filters.get("from"),
    to = filters.get("to"),
    cursor = filters.get("cursor");
  if (from && to && from > to) return null;
  const cursorWorkspace = cursor
    ? boundCursor(cursor, JSON.stringify([from, to]))
    : null;
  return cursor && !cursorWorkspace ? null : { filters, cursorWorkspace };
}

function boundCursor(raw: string, filter: string) {
  if (!/^[\w-]{1,256}$/.test(raw)) return null;
  try {
    const buffer = Buffer.from(raw, "base64url");
    const json = buffer.toString();
    const value: unknown = JSON.parse(json);
    if (
      raw !== buffer.toString("base64url") ||
      !Array.isArray(value) ||
      value.length !== 4 ||
      json !== JSON.stringify(value)
    )
      return null;
    const [workspace, timestamp, id, binding] = value;
    return validId(workspace) &&
      validId(id) &&
      typeof timestamp === "string" &&
      /^(?!0000)\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(timestamp) &&
      new Date(timestamp).toJSON()?.slice(0, 23) === timestamp.slice(0, 23) &&
      binding === filter
      ? workspace
      : null;
  } catch {
    return null;
  }
}

export const validId = (v: unknown): v is string =>
  typeof v === "string" && WORKSPACE_ID.test(v);
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object";
function allocation(row: unknown) {
  if (
    !object(row) ||
    !validId(row.categoryId) ||
    typeof row.rolloverPolicy !== "string" ||
    !Object.hasOwn(rollover, row.rolloverPolicy)
  )
    return null;
  const planned = amount(row.planned),
    actual = amount(row.actual),
    available = amount(row.available);
  if (
    !planned ||
    !actual ||
    !available ||
    (row.rolloverTargetId != null && !validId(row.rolloverTargetId))
  )
    return null;
  return {
    categoryId: row.categoryId.toLowerCase(),
    planned,
    actual,
    available,
    policy: row.rolloverPolicy as keyof typeof rollover,
    target: row.rolloverTargetId?.toLowerCase() ?? "",
  };
}
function budget(row: unknown) {
  if (!object(row)) return null;
  const {
    id,
    name,
    method,
    periodStart,
    periodEnd,
    currency,
    allocations,
    version,
  } = row;
  if (
    !validId(id) ||
    typeof name !== "string" ||
    typeof method !== "string" ||
    !Object.hasOwn(methods, method) ||
    typeof periodStart !== "string" ||
    !calendarDate(periodStart) ||
    typeof periodEnd !== "string" ||
    !calendarDate(periodEnd) ||
    typeof currency !== "string" ||
    !/^[A-Z]{3}$/.test(currency) ||
    !Array.isArray(allocations) ||
    typeof version !== "number" ||
    !Number.isSafeInteger(version) ||
    version < 1
  )
    return null;
  const rows = (allocations as unknown[]).map(allocation);
  if (
    !rows.every(
      (line) =>
        line &&
        [line.planned, line.actual, line.available].every(
          (value) => value.currency === currency,
        ),
    )
  )
    return null;
  return {
    id: id.toLowerCase(),
    name,
    method: method as keyof typeof methods,
    periodStart,
    periodEnd,
    currency,
    allocations: rows.filter((line) => line !== null),
    version,
  };
}

export async function budgetScope(token: string) {
  const scope = await ledgerScope(token);
  if (!scope) return null;
  return {
    ...scope,
    async list(query: URLSearchParams) {
      const response = await scope.request(
        `budgets${query.size ? `?${query}` : ""}`,
      );
      if (response?.status === 400) return "invalid-filters" as const;
      return response?.ok
        ? parsePage(await response.json().catch(() => null), budget)
        : null;
    },
    async detail(id: string) {
      const response = await scope.request(`budgets/${id}`);
      if (response?.status === 404) notFound();
      const row =
        response?.ok && budget(await response.json().catch(() => null));
      return row && row.id === id
        ? { ...row, etag: response.headers.get("etag") }
        : null;
    },
  };
}

export function percentUsed(actual: string, planned: string) {
  const denominator = BigInt(planned);
  const zero = BigInt(0),
    hundred = BigInt(100);
  if (denominator <= zero) return "No aplica";
  const numerator = BigInt(actual) * hundred * hundred;
  const magnitude = numerator < zero ? -numerator : numerator;
  const rounded = (magnitude + denominator / BigInt(2)) / denominator;
  return `${numerator < zero && rounded > zero ? "−" : ""}${rounded / hundred},${String(rounded % hundred).padStart(2, "0")} %`;
}
