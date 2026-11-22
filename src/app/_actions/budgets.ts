"use server";

import { decimalToMinor } from "@/lib/account-money";
import { budgetScope, methods, rollover, validId } from "@/lib/budgets-gateway";
import { persistentDraft } from "@/lib/draft-idempotency";
import { draftWarning } from "@/lib/draft-retry";
import { fields } from "@/lib/financial-draft";
import { requireProfile } from "@/lib/require-profile";
import { calendarDate } from "@/lib/view-filters";

export type BudgetResult =
  | { error: string; confirmation?: string }
  | { id: string; receipt: string }
  | null;
export type Binding = {
  workspaceId: string;
  id?: string;
  etag?: string;
  currency?: string;
};

function validBinding({ workspaceId, id, etag }: Binding) {
  return (
    validId(workspaceId) &&
    (id === undefined
      ? etag === undefined
      : validId(id) && !!etag && /^"[1-9]\d{0,9}"$/.test(etag))
  );
}

export async function saveBudget(
  bound: Binding,
  _state: BudgetResult,
  form: FormData,
): Promise<BudgetResult> {
  const invalid = { error: "Revisa los datos del presupuesto." };
  const draft = fields(form, ["name", "method"]);
  if (
    !validBinding(bound) ||
    !draft ||
    !draft.name ||
    [...draft.name].length > 120 ||
    !Object.hasOwn(methods, draft.method)
  )
    return invalid;
  if (bound.id) return submit(bound, "PATCH", draft, form);
  const period = fields(form, ["periodStart", "periodEnd", "copyFromBudgetId"]);
  if (
    !period ||
    !calendarDate(period.periodStart) ||
    !calendarDate(period.periodEnd)
  )
    return invalid;
  const days =
    (Date.parse(period.periodEnd) - Date.parse(period.periodStart)) / 86400000;
  if (
    days <= 0 ||
    days > 366 ||
    (period.copyFromBudgetId && !validId(period.copyFromBudgetId))
  )
    return invalid;
  return submit(
    bound,
    "POST",
    {
      ...draft,
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      ...(period.copyFromBudgetId && {
        copyFromBudgetId: period.copyFromBudgetId.toLowerCase(),
      }),
    },
    form,
  );
}

export async function saveAllocations(
  bound: Binding,
  _state: BudgetResult,
  form: FormData,
): Promise<BudgetResult> {
  const invalid = { error: "Revisa las asignaciones." };
  const currency = bound.currency;
  if (
    !bound.id ||
    !validBinding(bound) ||
    !currency ||
    !/^[A-Z]{3}$/.test(currency)
  )
    return invalid;
  const columns = [
    "categoryId",
    "planned",
    "rolloverPolicy",
    "rolloverTargetId",
  ].map((name) => form.getAll(name));
  const [ids, planned, policies, targets] = columns;
  if (
    ids.length > 1000 ||
    columns.some((column) => column.length !== ids.length)
  )
    return invalid;
  const allocations = [],
    seen = new Set<string>();
  for (let i = 0; i < ids.length; i++) {
    const raw = ids[i],
      value = planned[i],
      policy = policies[i],
      target = targets[i];
    if (
      !validId(raw) ||
      typeof value !== "string" ||
      typeof policy !== "string" ||
      !Object.hasOwn(rollover, policy) ||
      policy === "to_fund" ||
      (policy === "to_category" ? !validId(target) : target !== "")
    )
      return invalid;
    const categoryId = raw.toLowerCase(),
      amountMinor = decimalToMinor(value.trim(), currency);
    if (seen.has(categoryId) || amountMinor === null) return invalid;
    seen.add(categoryId);
    allocations.push({
      categoryId,
      planned: { amountMinor, currency },
      rolloverPolicy: policy,
      ...(typeof target === "string" &&
        target && { rolloverTargetId: target.toLowerCase() }),
    });
  }
  allocations.sort((left, right) =>
    left.categoryId.localeCompare(right.categoryId),
  );
  return submit(bound, "PUT", { allocations }, form);
}

async function submit(
  bound: Binding,
  method: "POST" | "PATCH" | "PUT",
  draft: object,
  form: FormData,
): Promise<BudgetResult> {
  const profile = await requireProfile();
  if (profile.kind === "failed")
    return { error: "No pudimos consultar tu perfil." };
  const scope = await budgetScope(profile.accessToken);
  if (!scope || scope.workspaceId !== bound.workspaceId)
    return { error: "El espacio activo cambió. Vuelve a Presupuestos." };
  const id = bound.id?.toLowerCase();
  const route =
    method === "POST"
      ? "budgets"
      : `budgets/${id}${method === "PUT" ? "/allocations" : ""}`;
  const pending = await persistentDraft(
    scope.workspaceId,
    profile.userId,
    `${method} ${route}`,
    { ...draft, etag: bound.etag },
    { serverTime: scope.serverTime, form },
  );
  if (!pending)
    return { error: "Recarga la página antes de volver a intentarlo." };
  if (pending.confirmation)
    return { error: draftWarning, confirmation: pending.confirmation };
  const response = await scope.request(route, {
    method,
    headers: {
      "content-type": "application/json",
      "idempotency-key": pending.key,
      ...(bound.etag && { "if-match": bound.etag }),
    },
    body: JSON.stringify(draft),
  });
  if (response?.status === 412)
    return {
      error: "El presupuesto cambió. Vuelve al detalle antes de editarlo.",
    };
  const body: { id?: unknown } | null =
    response?.status === (method === "POST" ? 201 : 200)
      ? await response.json().catch(() => null)
      : null;
  if (!validId(body?.id) || (id && body.id.toLowerCase() !== id))
    return {
      error:
        method === "PUT"
          ? "No pudimos guardar las asignaciones."
          : "No pudimos guardar el presupuesto.",
    };
  pending.receipt(pending.key);
  return { id: body.id.toLowerCase(), receipt: pending.key };
}
