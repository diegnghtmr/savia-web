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
  const zero = BigInt(0);
  const total = decimalToMinor(input.totalAmount, currency);
  if (total === null || BigInt(total) <= zero) return invalid;
  const [suppliedPrincipal, interest, fee] = parts.map((part) => {
    const amount = decimalToMinor(input[part] || "0", currency);
    return amount === null ? null : BigInt(amount);
  });
  if (
    suppliedPrincipal === null ||
    interest === null ||
    fee === null ||
    interest < zero ||
    fee < zero
  )
    return invalid;
  const totalMinor = BigInt(total);
  const principal = input.principalAmount
    ? suppliedPrincipal
    : totalMinor - interest - fee;
  if (principal < zero || principal + interest + fee !== totalMinor)
    return invalid;

  // Serialize the resolved split once for both draft identity and dispatch.
  // Preserve the backend's compact all-principal representation and omit zeros.
  const money = (minor: bigint) => ({
    amountMinor: minor.toString(),
    currency,
  });
  const split =
    interest === zero && fee === zero
      ? {}
      : {
          principalAmount: money(principal),
          ...(interest > zero && { interestAmount: money(interest) }),
          ...(fee > zero && { feeAmount: money(fee) }),
        };
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
