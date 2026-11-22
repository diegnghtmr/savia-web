"use server";

import { createHash } from "node:crypto";
import { redirect } from "next/navigation";
import { decimalToMinor } from "@/lib/account-money";
import { insightsTransport } from "@/lib/insights-gateway";
import { requireProfile } from "@/lib/require-profile";
import { scenarioResult } from "@/lib/scenario-gateway";
import { readWorkspaceContext } from "@/lib/workspace-context";
import { WORKSPACE_ID } from "@/lib/workspace-gateway";

type Bound = { workspaceId: string; userId: string; currency: string };

async function scenarioAccess(bound: Bound) {
  const profile = await requireProfile();
  if (profile.kind !== "ready" || profile.userId !== bound.userId) return null;
  const context = await readWorkspaceContext(profile.accessToken);
  if (context.kind === "unauthenticated") redirect("/sign-in");
  if (
    context.kind !== "ok" ||
    context.active?.id !== bound.workspaceId ||
    context.active.baseCurrency !== bound.currency
  )
    return null;
  return insightsTransport(profile.accessToken, context.active);
}

export async function runScenario(
  bound: Bound & { id: string; key: string },
  prior: string | ReturnType<typeof scenarioResult>,
) {
  if (!WORKSPACE_ID.test(bound.id) || !WORKSPACE_ID.test(bound.key))
    return "Este escenario no está disponible.";
  const request = await scenarioAccess(bound);
  if (!request) return "El espacio activo cambió. Vuelve a Escenarios.";
  if (prior && typeof prior !== "string") return prior;
  const response = await request(`scenarios/${bound.id}/runs`, undefined, {
    method: "POST",
    headers: { "idempotency-key": bound.key },
  });
  if (response?.status === 200) {
    const result = scenarioResult(
      await response.json().catch(() => null),
      bound.id,
      bound.currency,
    );
    if (result) return result;
  }
  return "No pudimos simular el escenario.";
}

function text(form: FormData, field: string) {
  const values = form.getAll(field);
  return values.length === 1 && typeof values[0] === "string"
    ? values[0].trim()
    : "";
}

export async function createExpenseScenario(
  bound: Bound & { nonce: string },
  _prior: string | null,
  form: FormData,
) {
  const name = text(form, "name");
  const change = text(form, "change");
  const amountMinor = decimalToMinor(change, bound.currency);
  if (!name || [...name].length > 120 || !amountMinor || amountMinor === "0")
    return "Revisa el nombre y el cambio de gasto mensual.";
  const request = await scenarioAccess(bound);
  if (!request) return "El espacio activo cambió. Vuelve a Escenarios.";
  const body = JSON.stringify({
    name,
    assumptions: [{ type: "expense_change", value: { amountMinor } }],
  });
  const hex = createHash("sha256")
    .update(bound.nonce)
    .update(body)
    .digest("hex");
  const key = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-8${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
  const response = await request("scenarios", undefined, {
    method: "POST",
    headers: { "idempotency-key": key, "content-type": "application/json" },
    body,
  });
  if (response?.status === 201) redirect("/analytics/scenarios");
  return "No pudimos crear el escenario.";
}
