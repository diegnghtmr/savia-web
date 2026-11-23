"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { decimalToMinor } from "@/lib/account-money";
import { persistentDraft } from "@/lib/draft-idempotency";
import { draftWarning, type DraftWarning } from "@/lib/draft-retry";
import { requireProfile } from "@/lib/require-profile";
import { ledgerScope, types } from "@/lib/transactions-gateway";
import { calendarDate } from "@/lib/view-filters";
import { WORKSPACE_ID } from "@/lib/workspace-gateway";

type Bound = { workspaceId: string };
export type TransactionSubmission = Bound &
  (
    | { mode: "create"; currencies: Record<string, string> }
    | {
        mode: "edit";
        id: string;
        etag: string;
        occurredAt: string;
      }
    | { mode: "void"; id: string; etag: string }
  );
const uuid = (value: unknown): value is string =>
  typeof value === "string" && WORKSPACE_ID.test(value);
const clean = (value: string, max: number) =>
  !value.includes("\0") && [...value].length <= max;

function payload(bound: TransactionSubmission, form: FormData) {
  const get = (field: string, optional = false) => {
    const values = form.getAll(field);
    if (!values.length && optional) return "";
    return values.length === 1 && typeof values[0] === "string"
      ? values[0].trim()
      : null;
  };
  if (bound.mode === "void") {
    const reason = get("reason");
    return reason &&
      [...reason].length >= 3 &&
      clean(reason, 500) &&
      get("confirm") === "yes"
      ? { reason }
      : null;
  }
  const date = get("date"),
    description = get("description", true);
  const category = get("categoryId", true),
    payee = get("payeeId", true);
  const tags = form.getAll("tagIds");
  if (
    !date ||
    !calendarDate(date) ||
    description === null ||
    !clean(description, 500) ||
    (category !== "" && !uuid(category)) ||
    (payee !== "" && !uuid(payee)) ||
    !tags.every(uuid)
  )
    return null;
  const tagIds = tags.map((tag) => tag.toLowerCase()).sort();
  if (new Set(tagIds).size !== tagIds.length) return null;
  const old =
    bound.mode === "edit" ? new Date(bound.occurredAt).toJSON() : null;
  const fields = {
    occurredAt:
      old?.slice(0, 10) === date && bound.mode === "edit"
        ? bound.occurredAt
        : `${date}T00:00:00.000Z`,
    categoryId: category?.toLowerCase() || null,
    payeeId: payee?.toLowerCase() || null,
    description: description || null,
    tagIds,
  };
  if (bound.mode === "edit") {
    const value = get("extraordinary", true);
    if (!old || (value !== "" && value !== "true" && value !== "false"))
      return null;
    return value === ""
      ? fields
      : { ...fields, extraordinary: value === "true" };
  }
  const type = get("type"),
    account = get("accountId"),
    amount = get("amount");
  if (!type || !Object.hasOwn(types, type) || !uuid(account) || !amount)
    return null;
  const accountId = account.toLowerCase();
  const currency = bound.currencies?.[accountId];
  if (typeof currency !== "string" || !/^[A-Z]{3}$/.test(currency)) return null;
  const amountMinor = decimalToMinor(amount, currency);
  // The ledger needs an equal and opposite signed 64-bit reversal.
  if (amountMinor === null || amountMinor === "-9223372036854775808")
    return null;
  return { ...fields, type, accountId, amount: { amountMinor, currency } };
}

export async function saveTransactionAction(
  bound: TransactionSubmission,
  _previous: string | DraftWarning | null,
  form: FormData,
): Promise<string | DraftWarning | null> {
  const invalid = "Revisa los datos de la transacción.";
  if (
    !bound ||
    !["create", "edit", "void"].includes(bound.mode) ||
    !uuid(bound.workspaceId) ||
    (bound.mode !== "create" &&
      (!uuid(bound.id) ||
        typeof bound.etag !== "string" ||
        !/^"[1-9]\d{0,9}"$/.test(bound.etag))) ||
    (bound.mode === "edit" && typeof bound.occurredAt !== "string")
  )
    return invalid;
  const draft = payload(bound, form);
  if (!draft) return invalid;
  const profile = await requireProfile();
  if (profile.kind === "failed") return "No pudimos consultar tu perfil.";
  const scope = await ledgerScope(profile.accessToken);
  if (scope?.workspaceId !== bound.workspaceId)
    return "El espacio activo cambió. Vuelve a Transacciones.";
  const id = bound.mode === "create" ? "" : bound.id.toLowerCase();
  const etag = bound.mode === "create" ? undefined : bound.etag;
  const method = bound.mode === "edit" ? "PATCH" : "POST";
  const suffix = id ? `/${id}${bound.mode === "void" ? "/void" : ""}` : "";
  const saved = await persistentDraft(
    scope.workspaceId,
    profile.userId,
    id ? `${method} transactions${suffix}` : "transactions",
    etag ? { ...draft, etag } : draft,
    { serverTime: scope.serverTime, form },
  );
  if (!saved) return "Recarga la página antes de volver a intentarlo.";
  if (saved.confirmation)
    return { error: draftWarning, confirmation: saved.confirmation };
  const result = await scope.mutate(
    suffix,
    method,
    id ? 200 : 201,
    draft,
    saved.key,
    etag,
  );
  if (result === "stale")
    return "La transacción cambió. Recarga la página antes de volver a intentarlo.";
  if (result === "conflict")
    return "No se puede realizar el cambio. Revisa el estado de la transacción.";
  if (!result || (id && result.id !== id))
    return "No pudimos guardar la transacción. Vuelve a intentarlo.";
  saved.receipt(saved.key, result.id);
  revalidatePath("/transactions");
  redirect(`/transactions/${result.id}`);
}
