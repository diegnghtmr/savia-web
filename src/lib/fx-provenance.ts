import "server-only";

import { record } from "./insights-gateway";
import { calendarDate } from "./view-filters";

type FxFreshness = "fresh" | "stale" | "unknown";
const isFreshness = (value: unknown): value is FxFreshness =>
  value === "fresh" || value === "stale" || value === "unknown";

export function fxProvenance(input: unknown) {
  if (!Array.isArray(input) || !input.length) return null;
  const rates = input.map((value: unknown) => {
    const { baseCurrency, quoteCurrency, rate, rateDate, source, freshness } =
      record(value) ?? {};
    if (
      typeof baseCurrency !== "string" ||
      !/^[A-Z]{3}$/.test(baseCurrency) ||
      typeof quoteCurrency !== "string" ||
      !/^[A-Z]{3}$/.test(quoteCurrency) ||
      baseCurrency === quoteCurrency ||
      typeof rate !== "string" ||
      !/^\d+(?:\.\d+)?$/.test(rate) ||
      !/[1-9]/.test(rate) ||
      typeof rateDate !== "string" ||
      !calendarDate(rateDate) ||
      typeof source !== "string" ||
      !source.trim() ||
      !isFreshness(freshness)
    )
      return null;
    return { baseCurrency, quoteCurrency, rate, rateDate, source, freshness };
  });
  return rates.every((row) => row !== null) ? rates : null;
}
export type FxProvenance = ReturnType<typeof fxProvenance>;
