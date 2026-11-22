// The web form uses the AccountType and AccountStatus enums from the API.
export const ACCOUNT_TYPES = {
  cash: "Efectivo",
  savings: "Ahorros",
  checking: "Cuenta corriente",
  digital_wallet: "Billetera digital",
  credit_card: "Tarjeta de crédito",
  loan: "Préstamo",
  investment_manual: "Inversión manual",
  receivable: "Cuenta por cobrar",
  generic: "Genérica",
  informal_debt: "Deuda informal",
};
export type AccountType = keyof typeof ACCOUNT_TYPES;
export const INFORMAL_DEBT_DIRECTIONS = {
  i_owe: "Debo",
  owed_to_me: "Me deben",
};
export function informalDebtDetails(counterparty: unknown, direction: unknown) {
  if (
    typeof counterparty !== "string" ||
    typeof direction !== "string" ||
    !Object.hasOwn(INFORMAL_DEBT_DIRECTIONS, direction)
  )
    return null;
  const counterpartyName = counterparty.trim();
  return counterpartyName &&
    [...counterpartyName].length <= 120 &&
    !counterpartyName.includes("\0")
    ? {
        counterpartyName,
        direction: direction as keyof typeof INFORMAL_DEBT_DIRECTIONS,
      }
    : null;
}
export const ACCOUNT_STATUSES = {
  active: "Activa",
  archived: "Archivada",
  closed: "Cerrada",
};
export type AccountStatus = keyof typeof ACCOUNT_STATUSES;
export type AccountDraft = {
  name: string;
  type: string;
  currency: string;
  openingBalance?: { amountMinor: string; currency: string };
  openingBalanceDate?: string;
  informalDebt?: NonNullable<ReturnType<typeof informalDebtDetails>>;
};
export const ACCOUNT_TEXT = [
  ["name", "Nombre de la cuenta", 120],
  ["institution", "Institución", 120],
  ["maskedNumber", "Número enmascarado", 32],
  ["description", "Descripción", 500],
] as const;
export type AccountEdit = Record<(typeof ACCOUNT_TEXT)[number][0], string> & {
  status: AccountStatus;
  includeInNetWorth: string;
};
