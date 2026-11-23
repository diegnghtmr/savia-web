import "server-only";

import { fxProvenance } from "./fx-provenance";
import { baseAmount, insightsTransport, record } from "./insights-gateway";
import type { InsightsPeriod } from "./insights-period";
import { calendarDate } from "./view-filters";

export async function readBalanceProjection(
  token: string,
  workspace: Parameters<typeof insightsTransport>[1],
  period: InsightsPeriod,
) {
  const currency = workspace.baseCurrency;
  if (!currency) return null;
  const response = await insightsTransport(token, workspace)(
    "analytics/advanced",
    new URLSearchParams({ ...period, metric: "balance_projection" }),
    { signal: AbortSignal.timeout(5000) },
  );
  if (response?.status !== 200) return null;
  const body = record(await response.json().catch(() => null));
  if (body?.metric !== "balance_projection") return null;
  const data = record(body.data);
  if (!Array.isArray(data?.months)) return null;
  const opening = baseAmount(
    { currency, amountMinor: data.openingBalanceMinor },
    currency,
  );
  const basisMonths = data.basisMonths;
  if (
    !opening ||
    typeof basisMonths !== "number" ||
    !Number.isSafeInteger(basisMonths) ||
    basisMonths < 0
  )
    return null;
  const months = (data.months as unknown[]).map((value) => {
    const row = record(value);
    const month = row?.month;
    const balance = baseAmount(
      { currency, amountMinor: row?.projectedBalanceMinor },
      currency,
    );
    return typeof month === "string" &&
      calendarDate(month) &&
      month.endsWith("-01") &&
      month.slice(0, 7) >= period.from.slice(0, 7) &&
      month <= period.to &&
      balance
      ? { month, balance }
      : null;
  });
  if (months.some((month) => !month)) return null;
  return {
    opening,
    basisMonths,
    fxRates: fxProvenance(body.fxRatesUsed),
    months: months.filter((month) => month !== null),
  };
}
