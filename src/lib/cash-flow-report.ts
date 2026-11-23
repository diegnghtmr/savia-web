import "server-only";

import type { AnalyticsFilters } from "./analytics-filters";
import { fxProvenance } from "./fx-provenance";
import { baseAmount, insightsTransport, record } from "./insights-gateway";
import { calendarDate } from "./view-filters";
import { WORKSPACE_ID } from "./workspace-gateway";

export async function readCashFlow(
  token: string,
  workspace: Parameters<typeof insightsTransport>[1],
  filters: AnalyticsFilters,
) {
  const { granularity, period, presentationCurrency } = filters;
  const currency = presentationCurrency ?? workspace.baseCurrency;
  if (!currency) return null;
  const query = new URLSearchParams(filters.query);
  query.set("granularity", granularity);
  const response = await insightsTransport(token, workspace)(
    "analytics/cash-flow",
    query,
    { signal: AbortSignal.timeout(5000) },
  );
  if (response?.status === 404 || response?.status === 501)
    return "unavailable" as const;
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
      bucketStart(start, granularity) === start &&
      start >= bucketStart(period.from, granularity) &&
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
    fxRates: fxProvenance(body.fxRatesUsed),
    points: points.filter((point) => point !== null),
    categories: categories.filter((category) => category !== null),
  };
}

function bucketStart(
  date: string,
  granularity: AnalyticsFilters["granularity"],
) {
  const month = Number(date.slice(5, 7));
  const start =
    granularity === "year"
      ? 1
      : granularity === "quarter"
        ? 3 * Math.floor((month - 1) / 3) + 1
        : month;
  return `${date.slice(0, 4)}-${String(start).padStart(2, "0")}-01`;
}
