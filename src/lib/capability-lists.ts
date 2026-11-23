import "server-only";

import { approvalHash } from "./capability-input";
import { dataId } from "./data-access";
import { record } from "./insights-gateway";
import { viewFilters, type SearchParams } from "./view-filters";

export function listFilters(
  input: SearchParams,
  extra: Record<string, (value: string) => boolean> = {},
) {
  const allowed = ["cursor", "limit", ...Object.keys(extra)];
  if (Object.keys(input).some((key) => !allowed.includes(key))) return null;
  return viewFilters(input, extra);
}

export function nextPage(
  href: string,
  query: URLSearchParams,
  cursor: string | null | undefined,
) {
  if (!cursor || cursor === query.get("cursor") || !viewFilters({ cursor }, {}))
    return null;
  const next = new URLSearchParams(query);
  next.set("cursor", cursor);
  return `${href}?${next}`;
}

export function titled(item: unknown) {
  const value = record(item);
  const id = dataId(value?.id);
  return id && typeof value?.title === "string"
    ? { id, title: value.title }
    : null;
}

export function approval(value: unknown) {
  const row = record(value);
  const id = dataId(row?.id);
  if (
    !id ||
    !row ||
    typeof row.toolName !== "string" ||
    typeof row.riskClass !== "string" ||
    !approvalHash(row.argumentsHash) ||
    typeof row.status !== "string" ||
    typeof row.expiresAt !== "string"
  )
    return null;
  return {
    id,
    tool: row.toolName,
    risk: row.riskClass,
    hash: row.argumentsHash,
    status: row.status,
    expires: row.expiresAt,
    preview: record(row.preview),
  };
}
