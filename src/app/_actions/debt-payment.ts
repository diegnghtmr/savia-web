"use server";

import { decimalToMinor } from "@/lib/account-money";
import { debtId } from "@/lib/debts-gateway";
import {
  fields,
  submitFinancialDraft,
  type FinancialResult,
} from "@/lib/financial-draft";
import { calendarDate } from "@/lib/view-filters";

export type PaymentBinding = {
  workspaceId: string;
  id: string;
  currency: string;
  accounts: Record<string, string>;
};
const parts = ["principalAmount", "interestAmount", "feeAmount"] as const;

export async function payDebt(
  bound: PaymentBinding,
  _state: FinancialResult | null,
  form: FormData,
): Promise<FinancialResult> {
  const invalid = { error: "Revisa los datos del pago." };
  const input = fields(form, ["accountId", "totalAmount", "date", ...parts]);
  if (
    !input ||
    !debtId(bound?.workspaceId) ||
    !debtId(bound.id) ||
    !debtId(input.accountId) ||
    !calendarDate(input.date)
  )
    return invalid;
  const accountId = input.accountId.toLowerCase(),
    { currency } = bound;
  if (
    typeof currency !== "string" ||
    !/^[A-Z]{3}$/.test(currency) ||
    bound.accounts?.[accountId] !== currency
  )
    return invalid;
  const total = decimalToMinor(input.totalAmount, currency);
  if (total === null || BigInt(total) <= BigInt(0)) return invalid;
  const split: Partial<
    Record<(typeof parts)[number], { amountMinor: string; currency: string }>
  > = {};
  let sum = BigInt(0);
  for (const part of parts) {
    if (!input[part]) continue;
    const amountMinor = decimalToMinor(input[part], currency);
    if (amountMinor === null || BigInt(amountMinor) < BigInt(0)) return invalid;
    split[part] = { amountMinor, currency };
    sum += BigInt(amountMinor);
  }
  if (Object.keys(split).length && sum !== BigInt(total)) return invalid;
  return submitFinancialDraft(
    bound.workspaceId,
    `debts/${bound.id.toLowerCase()}/payments`,
    {
      accountId,
      totalAmount: { amountMinor: total, currency },
      ...split,
      occurredAt: `${input.date}T00:00:00Z`,
    },
    {
      workspace: "El espacio activo cambió. Vuelve a Deudas.",
      failed: "No se pudo registrar el pago. Vuelve a intentarlo.",
    },
    form,
  );
}
