"use server";

import { positiveMoney } from "@/lib/account-money";
import {
  fields,
  submitFinancialDraft,
  type FinancialResult,
} from "@/lib/financial-draft";
import { fundId } from "@/lib/funds-gateway";
import { calendarDate } from "@/lib/view-filters";

export type FundBinding = {
  workspaceId: string;
  contribution?: {
    id: string;
    currency: string;
    accounts: Record<string, string>;
  };
};

export async function saveFund(
  bound: FundBinding,
  _state: FinancialResult | null,
  form: FormData,
): Promise<FinancialResult> {
  const contribution = bound?.contribution;
  const invalid = {
    error: contribution
      ? "Revisa los datos del aporte."
      : "Revisa los datos del fondo.",
  };
  if (!fundId(bound?.workspaceId)) return invalid;
  const workspace = "El espacio activo cambió. Vuelve a Fondos.";
  if (contribution) {
    const input = fields(form, ["accountId", "amount", "date", "notes"]);
    if (
      !input ||
      !fundId(contribution.id) ||
      !fundId(input.accountId) ||
      !calendarDate(input.date) ||
      [...input.notes].length > 500
    )
      return invalid;
    const accountId = input.accountId.toLowerCase();
    const currency = contribution.currency;
    if (
      typeof currency !== "string" ||
      contribution.accounts?.[accountId] !== currency
    )
      return invalid;
    const amount = positiveMoney(input.amount, currency);
    if (!amount) return invalid;
    return submitFinancialDraft(
      bound.workspaceId,
      `funds/${contribution.id.toLowerCase()}/contributions`,
      {
        accountId,
        amount,
        occurredAt: `${input.date}T00:00:00Z`,
        notes: input.notes || null,
      },
      {
        workspace,
        failed: "No se pudo registrar el aporte. Vuelve a intentarlo.",
      },
      form,
    );
  }
  const input = fields(form, [
    "name",
    "currency",
    "amount",
    "targetDate",
    "linkedAccountId",
  ]);
  if (
    !input ||
    !input.name ||
    [...input.name].length > 120 ||
    (input.targetDate && !calendarDate(input.targetDate)) ||
    (input.linkedAccountId && !fundId(input.linkedAccountId))
  )
    return invalid;
  if (!/^[A-Za-z]{3}$/.test(input.currency)) return invalid;
  const currency = input.currency.toUpperCase();
  const targetAmount = positiveMoney(input.amount, currency);
  if (!targetAmount) return invalid;
  return submitFinancialDraft(
    bound.workspaceId,
    "funds",
    {
      name: input.name,
      currency,
      targetAmount,
      targetDate: input.targetDate || null,
      linkedAccountId: input.linkedAccountId.toLowerCase() || null,
    },
    { workspace, failed: "No se pudo crear el fondo. Vuelve a intentarlo." },
    form,
  );
}
