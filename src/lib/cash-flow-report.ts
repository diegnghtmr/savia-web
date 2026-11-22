import "server-only";

import { baseAmount, insightsTransport, record } from "./insights-gateway";
import type { InsightsPeriod } from "./insights-period";
import { calendarDate } from "./view-filters";
import { WORKSPACE_ID } from "./workspace-gateway";

export async function readCashFlow(
  token: string,
  workspace: Parameters<typeof insightsTransport>[1],
  period: InsightsPeriod,
) {
  const currency = workspace.baseCurrency;
  if (!currency) return null;
  const response = await insightsTransport(token, workspace)(
    "analytics/cash-flow",
    new URLSearchParams({ ...period, granularity: "month" }),
  );
  if (response?.status !== 200) return null;
  const body = record(await response.json().catch(() => null));
  if (!Array.isArray(body?.series) || !Array.isArray(body.categories))
    return null;
  const points = (body.series as unknown[]).map((value) => {
    const point = record(value);
    const start = point?.period;
    const net = baseAmount(point?.value, currency);
    return typeof start === "string" &&
      calendarDate(start) &&
      start.endsWith("-01") &&
      start.slice(0, 7) >= period.from.slice(0, 7) &&
      start <= period.to &&
      net
      ? { start, net }
      : null;
  });
  const categories = (body.categories as unknown[]).map((value) => {
    const category = record(value);
    const id = category?.categoryId;
    const name = category?.categoryName;
    const percent = category?.percentage;
    const total = baseAmount(category?.amount, currency);
    return typeof id === "string" &&
      WORKSPACE_ID.test(id) &&
      typeof name === "string" &&
      name.trim() &&
      typeof percent === "number" &&
      Number.isFinite(percent) &&
      total
      ? { id, name, percent, total }
      : null;
  });
  if (points.includes(null) || categories.includes(null)) return null;
  return {
    points: points.filter((point) => point !== null),
    categories: categories.filter((category) => category !== null),
  };
}
