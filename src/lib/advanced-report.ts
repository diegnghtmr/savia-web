import "server-only";

import { money } from "./account-money";
import type { AnalyticsFilters, Metric } from "./analytics-filters";
import { dataId } from "./data-access";
import { fxProvenance } from "./fx-provenance";
import { insightsTransport, record } from "./insights-gateway";
import { amount } from "./transactions-gateway";
import { calendarDate } from "./view-filters";

type Render = (value: unknown, currency: string) => string | null;
type Column = readonly [field: string, label: string, render: Render];
type Section = { key?: string; label?: string; columns: Column[] };
const text: Render = (value) =>
  typeof value === "string" && value.trim() ? value : null;
const date: Render = (value) =>
  typeof value === "string" && calendarDate(value) ? value : null;
const quarter: Render = (value) =>
  typeof value === "string" && /^\d{4}-Q[1-4]$/.test(value) ? value : null;
const minor: Render = (value, currency) =>
  typeof value === "string" && /^-?\d+$/.test(value)
    ? money({ amountMinor: value, currency })
    : null;
const monetary: Render = (value) => {
  const parsed = amount(value);
  return parsed ? money(parsed) : null;
};
const nullable =
  (parse: Render): Render =>
  (value, currency) =>
    value === null ? "No disponible" : parse(value, currency);
const count: Render = (value) =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? String(value)
    : null;
const percent: Render = (value) =>
  typeof value === "number" && Number.isFinite(value)
    ? `${value.toLocaleString("es-CO")} %`
    : null;
const weekday: Render = (value) =>
  typeof value === "number" && Number.isInteger(value)
    ? ([
        "Lunes",
        "Martes",
        "Miércoles",
        "Jueves",
        "Viernes",
        "Sábado",
        "Domingo",
      ][value - 1] ?? null)
    : null;
const day: Render = (value, currency) =>
  typeof value === "number" && value >= 1 && value <= 31
    ? count(value, currency)
    : null;

const sections: Record<Metric, Section[]> = {
  recurring_vs_variable: [
    {
      columns: [
        ["periodStart", "Desde", date],
        ["periodEnd", "Hasta", date],
        ["committedMinor", "Recurrente", minor],
        ["variableMinor", "Variable", minor],
        ["totalExpensesMinor", "Gasto total", minor],
        ["committedPercent", "Proporción recurrente", nullable(percent)],
        ["consideredSubscriptionCount", "Suscripciones consideradas", count],
        [
          "unclassifiedSubscriptionCount",
          "Suscripciones sin clasificar",
          count,
        ],
      ],
    },
  ],
  financial_calendar: [
    {
      label: "Totales previstos",
      columns: [
        ["totalExpectedInflowMinor", "Ingresos", minor],
        ["totalExpectedOutflowMinor", "Salidas", minor],
        ["debtsWithoutScheduledAmount", "Deudas sin importe programado", count],
        [
          "recurringRulesWithUnreadableTemplate",
          "Reglas sin plantilla legible",
          count,
        ],
      ],
    },
    {
      key: "days",
      columns: [
        ["date", "Fecha", date],
        ["expectedInflowMinor", "Ingresos previstos", minor],
        ["expectedOutflowMinor", "Salidas previstas", minor],
      ],
    },
    {
      key: "events",
      label: "Movimientos y eventos",
      columns: [
        ["date", "Fecha", date],
        ["label", "Movimiento", text],
        [
          "state",
          "Estado",
          (value) =>
            value === "actual"
              ? "Registrado"
              : value === "scheduled"
                ? "Programado"
                : null,
        ],
        [
          "direction",
          "Dirección",
          (value) =>
            value === "inflow"
              ? "Entrada"
              : value === "outflow"
                ? "Salida"
                : value === "none"
                  ? "Sin movimiento"
                  : null,
        ],
        ["amountMinor", "Importe", nullable(minor)],
      ],
    },
  ],
  weekday_heatmap: [
    {
      key: "series",
      columns: [
        ["weekday", "Día", weekday],
        ["transactionCount", "Transacciones", count],
        ["totalMinor", "Gasto", minor],
      ],
    },
  ],
  quarterly_average_comparison: [
    {
      key: "series",
      columns: [
        ["quarter", "Trimestre", quarter],
        ["monthsCounted", "Meses", count],
        ["averageMonthlyIncomeMinor", "Ingreso medio", minor],
        ["averageMonthlyExpensesMinor", "Gasto medio", minor],
        ["averageMonthlySavingsCapacityMinor", "Ahorro potencial medio", minor],
        [
          "savingsCapacityDeltaPercentVsPreviousQuarter",
          "Variación del ahorro potencial",
          nullable(percent),
        ],
      ],
    },
  ],
  subscription_price_increases: [
    {
      label: "Cobertura de suscripciones",
      columns: [
        ["consideredCount", "Consideradas", count],
        ["decreasedOrUnchangedCount", "Sin aumento", count],
        ["excludedForCurrencyMismatch", "Monedas distintas", count],
        ["excludedForZeroPrevious", "Importe anterior cero", count],
      ],
    },
    {
      key: "items",
      columns: [
        ["payeeName", "Beneficiario", text],
        ["previousAmount", "Anterior", monetary],
        ["currentAmount", "Actual", monetary],
        ["increasePercent", "Aumento", percent],
      ],
    },
  ],
  income_stability: [
    {
      columns: [
        ["monthsCounted", "Meses", count],
        ["meanMonthlyIncomeMinor", "Media mensual", minor],
        ["minMonthlyIncomeMinor", "Mínimo", minor],
        ["maxMonthlyIncomeMinor", "Máximo", minor],
        ["medianMonthlyIncomeMinor", "Mediana", minor],
        [
          "coefficientOfVariationPercent",
          "Coeficiente de variación",
          nullable(percent),
        ],
        ["trendPercent", "Tendencia", nullable(percent)],
        ["regularityPercent", "Regularidad", nullable(percent)],
      ],
    },
    {
      key: "sourceConcentration",
      label: "Concentración de ingresos",
      columns: [
        [
          "payeeId",
          "Beneficiario (ID)",
          (value) => (value === null ? "Sin identificar" : dataId(value)),
        ],
        ["amount", "Importe", monetary],
        ["sharePercent", "Proporción", percent],
      ],
    },
  ],
  monthly_savings_capacity: [
    {
      key: "series",
      columns: [
        ["month", "Mes", date],
        ["incomeMinor", "Ingresos", minor],
        ["expensesMinor", "Gastos", minor],
        ["savingsCapacityMinor", "Ahorro potencial", minor],
        ["recurringIncomeMinor", "Ingresos recurrentes", minor],
        ["essentialExpensesMinor", "Gastos esenciales", minor],
        ["discretionaryExpensesMinor", "Gastos discrecionales", minor],
        ["obligationsMinor", "Obligaciones", minor],
        ["currentSavingsMinor", "Ahorro actual", minor],
      ],
    },
  ],
  debt_cost_evolution: [
    {
      label: "Costo total de deuda",
      columns: [
        ["totalInterestMinor", "Intereses", minor],
        ["totalFeeMinor", "Comisiones", minor],
        ["totalCostMinor", "Costo", minor],
      ],
    },
    {
      key: "series",
      columns: [
        ["month", "Mes", date],
        ["principalPaidMinor", "Capital pagado", minor],
        ["paymentsMinor", "Pagos", minor],
        ["interestMinor", "Intereses", minor],
        ["feeMinor", "Comisiones", minor],
        ["totalCostMinor", "Costo", minor],
      ],
    },
    {
      key: "debtOutlook",
      label: "Estimación por deuda",
      columns: [
        ["debtId", "Deuda (ID)", dataId],
        ["estimatedFutureCost", "Costo futuro", nullable(monetary)],
        ["estimatedRemainingMonths", "Meses restantes", nullable(count)],
      ],
    },
  ],
  net_worth_history: [
    {
      key: "series",
      columns: [
        ["date", "Fecha", date],
        ["assets", "Activos", monetary],
        ["debts", "Deudas", monetary],
        ["netWorth", "Patrimonio neto", monetary],
        [
          "fxValuationChange",
          "Variación por tipo de cambio",
          nullable(monetary),
        ],
      ],
    },
  ],
  spending_heatmap: [
    {
      key: "cells",
      columns: [
        ["weekday", "Día de la semana", weekday],
        ["dayOfMonth", "Día del mes", day],
        ["amount", "Gasto neto", monetary],
        ["count", "Transacciones", count],
      ],
    },
  ],
  subscription_annual_cost: [
    {
      label: "Costo anual total estimado",
      columns: [["totalAnnualCost", "Importe", monetary]],
    },
    {
      key: "items",
      columns: [
        ["payeeName", "Beneficiario", text],
        ["currentAmount", "Importe actual", monetary],
        ["frequency", "Frecuencia", text],
        ["annualCost", "Costo anual estimado", nullable(monetary)],
      ],
    },
  ],
};

export async function readAdvanced(
  token: string,
  workspace: Parameters<typeof insightsTransport>[1],
  filters: AnalyticsFilters,
  metric: Metric,
) {
  const query = new URLSearchParams(filters.query);
  query.set("metric", metric);
  const response = await insightsTransport(token, workspace)(
    "analytics/advanced",
    query,
    { signal: AbortSignal.timeout(5000) },
  );
  if (response?.status === 404 || response?.status === 501)
    return "unavailable" as const;
  if (response?.status !== 200) return null;
  const body = record(await response.json().catch(() => null));
  const data = record(body?.data);
  const { currency, generatedAt, assumptions, missingData, explanation } =
    body ?? {};
  if (
    body?.metric !== metric ||
    !data ||
    typeof currency !== "string" ||
    currency !== (filters.presentationCurrency ?? workspace.baseCurrency) ||
    typeof generatedAt !== "string" ||
    !Number.isFinite(Date.parse(generatedAt)) ||
    !strings(assumptions) ||
    !strings(missingData)
  )
    return null;
  const tables = [];
  for (const section of sections[metric]) {
    const source =
      section.key === "events"
        ? eventRows(data.days)
        : section.key
          ? data[section.key]
          : [data];
    if (!Array.isArray(source)) return null;
    const rows = [];
    for (const item of source as unknown[]) {
      const row = record(item);
      if (!row) return null;
      const cells = section.columns.map(([name, , render]) =>
        render(row[name], currency),
      );
      if (cells.some((cell) => cell === null)) return null;
      rows.push(cells as string[]);
    }
    tables.push({
      label: section.label,
      headings: section.columns.map(([, label]) => label),
      rows,
    });
  }
  return {
    tables,
    assumptions,
    missingData,
    explanation: typeof explanation === "string" ? explanation : undefined,
    fxRates: fxProvenance(body.fxRatesUsed),
  };
}

function strings(values: unknown): values is string[] {
  return (
    Array.isArray(values) && values.every((value) => typeof value === "string")
  );
}

function eventRows(days: unknown) {
  if (!Array.isArray(days)) return null;
  const rows = [];
  for (const value of days as unknown[]) {
    const day = record(value);
    if (!Array.isArray(day?.items)) return null;
    for (const item of day.items as unknown[]) {
      const event = record(item);
      if (!event) return null;
      rows.push({ ...event, date: day.date });
    }
  }
  return rows;
}
