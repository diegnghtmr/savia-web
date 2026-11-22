import { money } from "@/lib/account-money";
import type { Debt } from "@/lib/debts-gateway";

export function DebtTerms({ debt, detail }: { debt: Debt; detail?: boolean }) {
  return (
    <dl>
      <dt>Saldo pendiente</dt>
      <dd>{money(debt.balance)}</dd>
      <dt>Tasa anual</dt>
      <dd>
        {debt.annualRate}
        {debt.rateType &&
          (debt.rateType === "fixed" ? " · Fija" : " · Variable")}
      </dd>
      <dt>Pago mínimo</dt>
      <dd>{debt.minimum ? money(debt.minimum) : "No informado"}</dd>
      <dt>Estado</dt>
      <dd>{debt.status}</dd>
      {detail && (
        <>
          <dt>Capital inicial</dt>
          <dd>{money(debt.capital)}</dd>
        </>
      )}
      {detail && debt.nextPaymentAt && (
        <>
          <dt>Próximo pago</dt>
          <dd>
            <time dateTime={debt.nextPaymentAt}>{debt.nextPaymentAt}</time>
          </dd>
        </>
      )}
    </dl>
  );
}
