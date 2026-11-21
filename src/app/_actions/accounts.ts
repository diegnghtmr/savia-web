"use server";

import { createHash } from "node:crypto";
import { redirect } from "next/navigation";
import { ACCOUNT_TYPES } from "@/lib/account-types";
import { accountScope, createAccount } from "@/lib/accounts-gateway";
import { requireSession } from "@/lib/session";
import { WORKSPACE_ID } from "@/lib/workspace-gateway";

export async function createAccountAction(
  submission: { nonce: string; workspaceId: string },
  _previous: string | null,
  form: FormData,
): Promise<string | null> {
  const text = (field: string) => {
    const [value, ...extras] = form.getAll(field);
    return typeof value === "string" && !extras.length ? value.trim() : "";
  };
  const draft = {
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
