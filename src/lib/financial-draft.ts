import "server-only";

import { persistentDraft } from "./draft-idempotency";
import { draftWarning } from "./draft-retry";
import { requireProfile } from "./require-profile";
import { ledgerScope, type FinancialRoute } from "./transactions-gateway";

export function fields<K extends string>(form: FormData, keys: readonly K[]) {
  const result = {} as Record<K, string>;
  for (const key of keys) {
    const values = form.getAll(key);
    if (values.length > 1 || (values.length && typeof values[0] !== "string"))
      return null;
    const value = (values[0] as string | undefined)?.trim() ?? "";
    if (value.includes("\0")) return null;
    result[key] = value;
  }
  return result;
}

export function rateDecimal(value: string) {
  const parts = /^(\d+)(?:[.,](\d+))?$/.exec(value);
  if (!parts) return null;
  const whole = parts[1].replace(/^0+(?=\d)/, "");
  const fraction = (parts[2] ?? "").replace(/0+$/, "");
  if ((!fraction && whole === "0") || whole.length > 20 || fraction.length > 18)
    return null;
  return fraction ? `${whole}.${fraction}` : whole;
}

export type FinancialResult = {
  error?: string;
  receipt?: string;
  confirmation?: string;
};

export async function submitFinancialDraft(
  workspaceId: string,
  route: FinancialRoute,
  draft: object,
  errors: { workspace: string; failed: string },
  form: FormData,
  equivalents?: readonly object[],
): Promise<FinancialResult> {
  const profile = await requireProfile();
  if (profile.kind === "failed")
    return { error: "No pudimos consultar tu perfil." };
  const scope = await ledgerScope(profile.accessToken);
  if (scope?.workspaceId !== workspaceId) return { error: errors.workspace };
  const key = await persistentDraft(
    scope.workspaceId,
    profile.userId,
    route,
    draft,
    { serverTime: scope.serverTime, form, equivalents },
  );
  if (!key) return { error: "Recarga la página antes de volver a intentarlo." };
  if (key.confirmation)
    return { error: draftWarning, confirmation: key.confirmation };
  const id = await scope.createFinancialRecord(route, key.payload, key.key);
  if (!id) return { error: errors.failed };
  key.receipt(id);
  return { receipt: id };
}
