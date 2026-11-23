"use server";

import { decimalToMinor } from "@/lib/account-money";
import {
  fields,
  rateDecimal,
  submitFinancialDraft,
  type FinancialResult,
} from "@/lib/financial-draft";
import { calendarDate } from "@/lib/view-filters";
import { WORKSPACE_ID } from "@/lib/workspace-gateway";

type TransferResult = FinancialResult & { field?: "fee" };

export async function recordTransfer(
  bound: { workspaceId: string; currencies: Record<string, string> },
  _state: TransferResult | null,
  form: FormData,
): Promise<TransferResult> {
  const invalid = { error: "Revisa los datos de la transferencia." };
  const input = fields(form, [
    "sourceAccountId",
    "destinationAccountId",
    "amount",
    "destinationAmount",
    "executedRate",
    "referenceRate",
    "fee",
    "date",
    "description",
  ]);
  if (
    !input ||
    !WORKSPACE_ID.test(bound.workspaceId) ||
    !WORKSPACE_ID.test(input.sourceAccountId) ||
    !WORKSPACE_ID.test(input.destinationAccountId) ||
    !calendarDate(input.date) ||
    [...input.description].length > 500
  )
    return invalid;
  const sourceAccountId = input.sourceAccountId.toLowerCase();
  const destinationAccountId = input.destinationAccountId.toLowerCase();
  const from = bound.currencies[sourceAccountId],
    to = bound.currencies[destinationAccountId];
  if (
    sourceAccountId === destinationAccountId ||
    !from ||
    !to ||
    ![from, to].every((value) => /^[A-Z]{3}$/.test(value))
  )
    return invalid;
  if (from !== to && input.fee)
    return {
      field: "fee",
      error: "La comisión solo se admite en transferencias en la misma moneda.",
    };
  const amount = positiveMoney(input.amount, from);
  const fee = input.fee ? positiveMoney(input.fee, from) : undefined;
  if (!amount || fee === null) return invalid;
  const base = {
    sourceAccountId,
    destinationAccountId,
    occurredAt: `${input.date}T00:00:00Z`,
    description: input.description || null,
  };
  const errors = {
    workspace: "El espacio activo cambió. Vuelve a Transferencias.",
    failed: "No se pudo registrar la transferencia. Vuelve a intentarlo.",
  };
  if (from === to) {
    if (input.destinationAmount || input.executedRate || input.referenceRate)
      return invalid;
    return submitFinancialDraft(
      bound.workspaceId,
      "transfers",
      { ...base, amount, ...(fee && { fee }) },
      errors,
      form,
    );
  }
  const destinationAmount = positiveMoney(input.destinationAmount, to);
  const executedRate = rateDecimal(input.executedRate);
  const referenceRate = input.referenceRate
    ? rateDecimal(input.referenceRate)
    : undefined;
  if (!destinationAmount || !executedRate || referenceRate === null)
    return invalid;
  return submitFinancialDraft(
    bound.workspaceId,
    "currency-exchanges",
    {
      ...base,
      sourceAmount: amount,
      destinationAmount,
      executedRate,
      ...(referenceRate && { referenceRate }),
    },
    errors,
    form,
  );
}

function positiveMoney(value: string, currency: string) {
  const amountMinor = decimalToMinor(value, currency);
  return amountMinor !== null &&
    amountMinor !== "0" &&
    !amountMinor.startsWith("-")
    ? { amountMinor, currency }
    : null;
}
