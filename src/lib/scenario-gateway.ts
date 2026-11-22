import "server-only";

import { baseAmount, insightsTransport, record } from "./insights-gateway";
import { parsePage } from "./transactions-gateway";
import { calendarDate } from "./view-filters";
import { WORKSPACE_ID } from "./workspace-gateway";

type Workspace = Parameters<typeof insightsTransport>[1];
const metrics = [
  ["monthlyIncomeMinor", "Ingresos mensuales"],
  ["monthlyExpensesMinor", "Gastos mensuales"],
  ["monthlySavingsCapacityMinor", "Capacidad mensual de ahorro"],
  ["netWorthMinor", "Patrimonio neto"],
] as const;

export async function readScenarios(token: string, workspace: Workspace) {
  const response = await insightsTransport(token, workspace)(
    "scenarios",
    new URLSearchParams({ limit: "200" }),
  );
  if (response?.status !== 200) return null;
  return parsePage(await response.json().catch(() => null), (value) => {
    const item = record(value);
    if (
      typeof item?.id !== "string" ||
      !WORKSPACE_ID.test(item.id) ||
      typeof item.name !== "string" ||
      !item.name.trim()
    )
      return null;
    return { id: item.id, name: item.name };
  });
}

export function scenarioResult(value: unknown, id: string, currency: string) {
  const run = record(value);
  if (run?.scenarioId !== id) return null;
  const risks = Array.isArray(run.risks)
    ? (run.risks as unknown[]).filter((risk) => typeof risk === "string")
    : [];
  if (run.status === "failed") return { kind: "failed" as const, risks };
  if (run.status !== "completed") return null;
  const parts = [run.baseline, run.projected, run.difference].map(record);
  const { periodStart: from, periodEnd: to } = parts[0] ?? {};
  if (
    typeof from !== "string" ||
    typeof to !== "string" ||
    !calendarDate(from) ||
    !calendarDate(to) ||
    from > to ||
    parts.some(
      (part) =>
        part?.baseCurrency !== currency ||
        part.periodStart !== from ||
        part.periodEnd !== to,
    )
  )
    return null;
  const rows = [];
  for (const [field, label] of metrics) {
    const amounts = parts.map((part) =>
      baseAmount({ amountMinor: part?.[field], currency }, currency),
    );
    if (amounts.some((amount) => !amount)) return null;
    rows.push({ label, amounts: amounts.filter((amount) => amount !== null) });
  }
  return { kind: "completed" as const, from, to, risks, rows };
}
