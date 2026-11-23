import "server-only";

import { strongETag } from "./etag";
import { fields } from "./financial-draft";
import { insightsTransport, record } from "./insights-gateway";
import { calendarDate } from "./view-filters";

export const preferencesRoute = "me/dashboard-preferences";
export const cardLabels = {
  net_worth: "Patrimonio neto",
  assets: "Activos",
  debts: "Deudas",
  income: "Ingresos del período",
  expenses: "Gastos del período",
  savings_capacity: "Flujo neto del período",
  budget_utilization: "Uso del presupuesto",
  account_balances: "Saldos de cuentas",
  upcoming_operations: "Próximas operaciones",
  alerts: "Alertas",
  reconciliation_status: "Estado de conciliación",
};
export const presetLabels = {
  this_month: "Este mes",
  this_quarter: "Este trimestre",
  this_year: "Este año",
  custom: "Personalizado",
};
type CardId = keyof typeof cardLabels;
const isCard = (id: unknown): id is CardId =>
  typeof id === "string" && Object.hasOwn(cardLabels, id);
const currency = (code: unknown): code is string =>
  typeof code === "string" && /^[A-Z]{3}$/.test(code);

type DashboardPeriod =
  | { preset: "this_month" | "this_quarter" | "this_year" }
  | { preset: "custom"; from: string; to: string };

function periodValue(input: unknown): DashboardPeriod | null {
  const { preset, from, to } = record(input) ?? {};
  if (
    preset === "this_month" ||
    preset === "this_quarter" ||
    preset === "this_year"
  )
    return { preset };
  if (
    preset === "custom" &&
    typeof from === "string" &&
    typeof to === "string" &&
    calendarDate(from) &&
    calendarDate(to) &&
    from <= to
  )
    return { preset, from, to };
  return null;
}

export function preferencesBody(value: unknown) {
  const body = record(value);
  const period = periodValue(body?.period);
  const code = body?.presentationCurrency;
  const version = body?.version;
  if (
    !body ||
    !period ||
    !currency(code) ||
    typeof version !== "number" ||
    !Number.isSafeInteger(version) ||
    version < 1 ||
    !Array.isArray(body.cards)
  )
    return null;
  const cards: { id: CardId; visible: boolean }[] = [];
  const seen = new Set<CardId>();
  for (const item of body.cards) {
    const card = record(item);
    if (
      !card ||
      !isCard(card.id) ||
      typeof card.visible !== "boolean" ||
      seen.has(card.id)
    )
      return null;
    seen.add(card.id);
    cards.push({ id: card.id, visible: card.visible });
  }
  return { period, cards, presentationCurrency: code };
}

export function preferencesDraft(form: FormData) {
  const input = fields(form, ["preset", "from", "to", "presentationCurrency"]);
  const period = periodValue(input);
  if (!input || !period || !currency(input.presentationCurrency)) return null;
  const ordered: { id: CardId; visible: boolean; order: number }[] = [];
  const seen = new Set<number>();
  for (const id of Object.keys(cardLabels).filter(isCard)) {
    const keys = [`order_${id}`, `visible_${id}`] as const;
    const data = fields(form, keys);
    if (!data) return null;
    const [order, visible] = keys.map((key) => data[key]);
    if (!order && !visible) continue;
    if (
      !/^(?:[1-9]|1[01])$/.test(order) ||
      seen.has(Number(order)) ||
      (visible !== "" && visible !== "yes")
    )
      return null;
    seen.add(Number(order));
    ordered.push({ id, visible: visible === "yes", order: Number(order) });
  }
  return {
    cards: ordered
      .sort((a, b) => a.order - b.order)
      .map(({ id, visible }) => ({ id, visible })),
    period,
    presentationCurrency: input.presentationCurrency,
  };
}

export async function readPreferences(
  token: string,
  workspace: Parameters<typeof insightsTransport>[1],
  signal?: AbortSignal,
) {
  const response = await insightsTransport(token, workspace)(
    preferencesRoute,
    undefined,
    { signal },
  );
  if (response?.status === 404 || response?.status === 501)
    return "unavailable" as const;
  const version = response?.headers.get("etag");
  if (response?.status !== 200 || !strongETag(version)) return null;
  const prefs = preferencesBody(await response.json().catch(() => null));
  return prefs && { ...prefs, version };
}
