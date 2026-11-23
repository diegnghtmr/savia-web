import "server-only";

import { decimalToMinor } from "./account-money";
import { dataId } from "./data-access";
import { fields } from "./financial-draft";
import { record } from "./insights-gateway";
import { amount } from "./transactions-gateway";
import { calendarDate } from "./view-filters";

export const scopes = [
  "accounts:read",
  "accounts:write",
  "transactions:read",
  "transactions:write",
  "budgets:read",
  "budgets:write",
  "reports:read",
  "reports:write",
  "workspace:admin",
];

// Names come from the OpenAPI x-savia-mcp-tool annotations.
const tools = new Set([
  "list_workspaces",
  "list_accounts",
  "create_account",
  "get_account_balance",
  "search_transactions",
  "create_transaction",
  "update_transaction",
  "void_transaction",
  "create_transfer",
  "create_cross_currency_transfer",
  "create_budget",
  "get_budget_status",
  "update_budget",
  "update_budget_allocations",
  "create_sinking_fund",
  "get_sinking_fund",
  "update_sinking_fund",
  "contribute_to_fund",
  "withdraw_from_fund",
  "get_debt_projection",
  "get_financial_summary",
  "create_forecast",
  "run_scenario",
  "scan_receipt",
  "create_report_definition",
  "run_report",
  "export_report_pdf",
  "list_ai_providers",
  "get_forecast",
]);
const time = "(?:[01]\\d|2[0-3]):[0-5]\\d";
const windowPattern = new RegExp(`^([1-7])\\s+(${time})\\s+(${time}|24:00)$`);
const expiryPattern = new RegExp(`^(\\d{4}-\\d{2}-\\d{2})T${time}$`);
const words = (value: string) => value.split(/[\s,]+/).filter(Boolean);
const unique = (values: readonly unknown[]) =>
  new Set(values).size === values.length;

export function grantDraft(workspaceId: string, form: FormData) {
  const data = fields(form, [
    "clientName",
    "cap",
    "currency",
    "expiresAt",
    "schedule",
    "tools",
    "accounts",
  ]);
  if (!data?.clientName || [...data.clientName].length > 120) return null;
  const selected = form.getAll("scope");
  if (
    !selected.length ||
    !unique(selected) ||
    selected.some(
      (value) => typeof value !== "string" || !scopes.includes(value),
    )
  )
    return null;
  const toolAllowlist = words(data.tools).sort();
  const unknownTool = toolAllowlist.some((tool) => !tools.has(tool));
  if (!unique(toolAllowlist) || unknownTool) return null;
  const accountIds = words(data.accounts).map(dataId);
  if (!unique(accountIds) || accountIds.includes(null)) return null;
  const windows = data.schedule.split(/\r?\n/);
  const schedule = [];
  const seen = new Set<string>();
  for (const raw of windows) {
    const window = raw.trim();
    if (!window) continue;
    const match = windowPattern.exec(window);
    if (!match || match[2] >= match[3]) return null;
    const [, day, startTime, endTime] = match;
    const key = `${day} ${startTime} ${endTime}`;
    if (seen.has(key)) return null;
    seen.add(key);
    schedule.push({ dayOfWeek: Number(day), startTime, endTime });
  }
  const currency = data.currency.toUpperCase();
  const amountMinor =
    data.cap && /^[A-Z]{3}$/.test(currency)
      ? decimalToMinor(data.cap, currency)
      : null;
  if (
    (data.cap || currency) &&
    (amountMinor === null || amountMinor.startsWith("-"))
  )
    return null;
  const date = data.expiresAt && expiryPattern.exec(data.expiresAt);
  if (data.expiresAt && (!date || !calendarDate(date[1]))) return null;
  const expiresAt = date
    ? new Date(`${data.expiresAt}:00Z`).toISOString()
    : undefined;
  return {
    clientName: data.clientName,
    scopes: selected.sort(),
    workspaceIds: [workspaceId],
    ...(accountIds.length && { accountIds: accountIds.sort() }),
    ...(amountMinor !== null && { maxWriteAmount: { amountMinor, currency } }),
    toolAllowlist,
    schedule,
    ...(expiresAt && { expiresAt }),
  };
}

export function grantSummary(item: unknown) {
  const row = record(item);
  const id = dataId(row?.id);
  if (!id || !row || typeof row.clientName !== "string") return null;
  const { status, scopes: granted } = row;
  if (status !== "active" && status !== "expired" && status !== "revoked")
    return null;
  if (!Array.isArray(granted)) return null;
  if (granted.some((value) => !scopes.includes(value))) return null;
  return {
    id,
    name: row.clientName,
    scopes: granted as string[],
    status,
    cap: amount(row.maxWriteAmount),
    expires: typeof row.expiresAt === "string" ? row.expiresAt : null,
    workspaceIds: Array.isArray(row.workspaceIds)
      ? row.workspaceIds.map(dataId).filter(Boolean).join(", ")
      : "",
    windows: Array.isArray(row.schedule) ? row.schedule.length : null,
    explicitTools: Array.isArray(row.toolAllowlist)
      ? row.toolAllowlist.length
      : null,
  };
}
