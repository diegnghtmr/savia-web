import { insightsPeriod } from "./insights-period";
import type { SearchParams } from "./view-filters";
import { WORKSPACE_ID } from "./workspace-gateway";

export const granularities = {
  day: "Día",
  week: "Semana",
  month: "mes",
  quarter: "trimestre",
  year: "año",
};
export const dimensions = {
  accountIds: "Cuentas",
  categoryIds: "Categorías",
  tagIds: "Etiquetas",
  payeeIds: "Beneficiarios",
  memberIds: "Miembros del espacio",
};
export const metrics = {
  recurring_vs_variable: "Gastos recurrentes y variables",
  financial_calendar: "Calendario financiero",
  weekday_heatmap: "Gastos por día de la semana",
  quarterly_average_comparison: "Promedios trimestrales",
  subscription_price_increases: "Aumentos de precio de suscripciones",
  income_stability: "Estabilidad de ingresos",
  monthly_savings_capacity: "Capacidad de ahorro mensual",
  debt_cost_evolution: "Evolución del costo de deuda",
  net_worth_history: "Historial del patrimonio neto",
  spending_heatmap: "Mapa de gastos",
  subscription_annual_cost: "Costo anual de suscripciones",
};
export type Metric = keyof typeof metrics;
type Granularity = keyof typeof granularities;

export function analyticsFilters(input: SearchParams) {
  const {
    from,
    to,
    granularity = "month",
    metric,
    presentationCurrency,
    ...filters
  } = input;
  const period = insightsPeriod({ from, to });
  if (!period) return "invalid-period" as const;
  if (
    typeof granularity !== "string" ||
    !Object.hasOwn(granularities, granularity) ||
    (metric !== undefined &&
      metric !== "" &&
      (typeof metric !== "string" || !Object.hasOwn(metrics, metric))) ||
    (presentationCurrency !== undefined &&
      (typeof presentationCurrency !== "string" ||
        !/^(?:[A-Z]{3})?$/.test(presentationCurrency)))
  )
    return null;
  const query = new URLSearchParams(period);
  if (presentationCurrency)
    query.set("presentationCurrency", presentationCurrency);
  for (const [key, value] of Object.entries(filters)) {
    if (!Object.hasOwn(dimensions, key)) return null;
    if (value === undefined || value === "") continue;
    const entries = (Array.isArray(value) ? value : value.split(",")).map(
      (id) => id.trim().toLowerCase(),
    );
    if (
      !entries.length ||
      new Set(entries).size !== entries.length ||
      !entries.every((id) => WORKSPACE_ID.test(id))
    )
      return null;
    for (const id of entries) query.append(key, id);
  }
  return {
    period,
    granularity: granularity as Granularity,
    metric: (metric || undefined) as Metric | undefined,
    presentationCurrency: presentationCurrency || undefined,
    query,
  };
}
export type AnalyticsFilters = Exclude<
  ReturnType<typeof analyticsFilters>,
  "invalid-period" | null
>;
