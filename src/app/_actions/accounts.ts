"use server";

import { createHash } from "node:crypto";
import { redirect } from "next/navigation";
import { decimalToMinor } from "@/lib/account-money";
import {
  ACCOUNT_TEXT,
  ACCOUNT_TYPES,
  type AccountDraft,
} from "@/lib/account-types";
import {
  ACCOUNT_ETAG,
  accountScope,
  closeAccount,
  createAccount,
  updateAccount,
} from "@/lib/accounts-gateway";
import { requireProfile } from "@/lib/require-profile";
import { requireSession } from "@/lib/session";
import { calendarDate } from "@/lib/view-filters";
import { WORKSPACE_ID } from "@/lib/workspace-gateway";

function singleText(form: FormData, field: string) {
  const [value, ...extras] = form.getAll(field);
  return typeof value === "string" && !extras.length ? value.trim() : null;
}

export async function changeAccountAction(
  submission: {
    accountId: string;
    workspaceId: string;
    etag: string;
    closeKey?: string;
  },
  _previous: string | null,
  form: FormData,
): Promise<string | null> {
  const { accountId, workspaceId, etag, closeKey } = submission;
  const invalid = "Revisa los datos de la cuenta.";
  if (!WORKSPACE_ID.test(accountId) || !ACCOUNT_ETAG.test(etag)) return invalid;
  const draft: Record<string, string | boolean | null> = {};
  if (closeKey !== undefined) {
    if (!WORKSPACE_ID.test(closeKey) || singleText(form, "confirm") !== "yes")
      return "Confirma el cierre de la cuenta.";
  } else {
    for (const [field, , max] of ACCOUNT_TEXT) {
      const value = singleText(form, field);
      if (
        value === null ||
        value.length > max ||
        value.includes("\0") ||
        (field === "name" && !value)
      )
        return invalid;
      draft[field] = value || null;
    }
    const status = singleText(form, "status");
    const netWorth = singleText(form, "includeInNetWorth");
    if (
      (status !== "active" && status !== "archived") ||
      (netWorth !== "true" && netWorth !== "false")
    )
      return invalid;
    Object.assign(draft, { status, includeInNetWorth: netWorth === "true" });
  }
  const profile = await requireProfile();
  if (profile.kind === "failed") return "No pudimos consultar tu perfil.";
  const scope = await accountScope(profile.accessToken);
  if (scope.kind === "unauthenticated") redirect("/sign-in");
  if (scope.kind === "failed") return "No pudimos verificar el espacio activo.";
  if (scope.kind === "empty" || scope.target.workspaceId !== workspaceId)
    return "El espacio activo cambió. Vuelve a Cuentas.";
  const result = closeKey
    ? await closeAccount(scope.target, accountId, etag, closeKey)
    : await updateAccount(scope.target, accountId, etag, draft);
  if (result.kind === "unauthenticated") redirect("/sign-in");
  if (result.kind === "failed") {
    if (result.status === 412)
      return "La cuenta cambió. Recarga la página antes de volver a intentarlo.";
    if (result.status === 409 && closeKey)
      return "No pudimos cerrar la cuenta. Revisa su estado y los movimientos pendientes.";
    return "No pudimos guardar el cambio. Vuelve a intentarlo.";
  }
  redirect(`/accounts/${accountId}`);
}

export async function createAccountAction(
  submission: { nonce: string; workspaceId: string },
  _previous: string | null,
  form: FormData,
): Promise<string | null> {
  const text = (field: string) => singleText(form, field) ?? "";
  const draft: AccountDraft = {
    name: text("name"),
    type: text("type"),
    currency: text("currency").toUpperCase(),
  };
  if (
    !draft.name ||
    draft.name.length > 120 ||
    draft.name.includes("\0") ||
    !Object.hasOwn(ACCOUNT_TYPES, draft.type) ||
    !/^[A-Z]{3}$/.test(draft.currency) ||
    !WORKSPACE_ID.test(submission.nonce)
  )
    return "Revisa el nombre, el tipo y la moneda.";
  const optional = (field: string) =>
    form.has(field) ? singleText(form, field) : "";
  const opening = optional("openingBalance");
  const date = optional("openingBalanceDate");
  const amountMinor = opening ? decimalToMinor(opening, draft.currency) : null;
  if (
    opening === null ||
    date === null ||
    (opening && amountMinor === null) ||
    (date && (!opening || !calendarDate(date)))
  )
    return "Revisa el saldo inicial y su fecha.";
  if (amountMinor !== null)
    draft.openingBalance = { amountMinor, currency: draft.currency };
  if (date) draft.openingBalanceDate = date;

  const { accessToken } = await requireSession();
  const scope = await accountScope(accessToken);
  if (scope.kind === "unauthenticated") redirect("/sign-in");
  if (scope.kind === "failed") return "No pudimos verificar el espacio activo.";
  if (
    scope.kind === "empty" ||
    scope.target.workspaceId !== submission.workspaceId
  )
    return "El espacio activo cambió. Vuelve a Cuentas.";

  // UUIDv8 scoped to the normalized draft, stable across retries of this form.
  const hex = createHash("sha256")
    .update(JSON.stringify([submission.nonce, draft]))
    .digest("hex");
  const key = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-8${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
  const result = await createAccount(scope.target, draft, key);
  if (result.kind === "unauthenticated") redirect("/sign-in");
  if (result.kind === "failed")
    return "No pudimos crear la cuenta. Vuelve a intentarlo.";
  redirect("/accounts");
}
