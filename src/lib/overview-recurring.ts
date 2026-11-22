import "server-only";

import { insightsTransport, record } from "./insights-gateway";
import { amount, parsePage } from "./transactions-gateway";
import { WORKSPACE_ID } from "./workspace-gateway";

function row(value: unknown, nameKey: string) {
  const body = record(value);
  const name = body?.[nameKey];
  return body &&
    typeof body.id === "string" &&
    WORKSPACE_ID.test(body.id) &&
    typeof name === "string" &&
    name.trim()
    ? { body, id: body.id, name }
    : null;
}

export async function readUpcoming(
  token: string,
  workspace: Parameters<typeof insightsTransport>[1],
) {
  if (!workspace.baseCurrency) return null;
  const response = await insightsTransport(token, workspace)(
    "recurring-rules",
    new URLSearchParams({ limit: "200" }),
  );
  if (response?.status !== 200) return null;
  const page = parsePage(await response.json().catch(() => null), (value) => {
    const rule = row(value, "name");
    const date = rule?.body.nextOccurrenceAt;
    if (
      !rule ||
      typeof rule.body.active !== "boolean" ||
      typeof date !== "string"
    )
      return null;
    const timestamp = Date.parse(date);
    return Number.isFinite(timestamp)
      ? { id: rule.id, name: rule.name, active: rule.body.active, timestamp }
      : null;
  });
  if (!page) return null;
  const now = Date.now();
  return {
    ...page,
    items: page.items
      .filter(({ active, timestamp }) => active && timestamp >= now)
      .sort((a, b) => a.timestamp - b.timestamp),
  };
}

export async function readDetected(
  token: string,
  workspace: Parameters<typeof insightsTransport>[1],
) {
  if (!workspace.baseCurrency) return null;
  const response = await insightsTransport(token, workspace)(
    "subscriptions",
    new URLSearchParams({ limit: "200", status: "detected" }),
  );
  if (response?.status !== 200) return null;
  return parsePage(await response.json().catch(() => null), (value) => {
    const candidate = row(value, "payeeName");
    if (!candidate || candidate.body.status !== "detected") return null;
    const current = amount(candidate.body.currentAmount);
    if (!current) return null;
    return {
      id: candidate.id,
      name: candidate.name,
      current: current.currency === workspace.baseCurrency ? current : null,
    };
  });
}
