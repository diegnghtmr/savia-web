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
};
export const ACCOUNT_STATUSES = {
  active: "Activa",
  archived: "Archivada",
  closed: "Cerrada",
};
export type AccountStatus = keyof typeof ACCOUNT_STATUSES;
export type AccountDraft = { name: string; type: string; currency: string };
