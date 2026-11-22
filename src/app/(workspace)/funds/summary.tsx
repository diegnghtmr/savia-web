import { money } from "@/lib/account-money";
import { percentUsed } from "@/lib/budgets-gateway";
import type { Fund } from "@/lib/funds-gateway";

export function FundSummary({ fund }: { fund: Fund }) {
  const remaining =
    BigInt(fund.target.amountMinor) - BigInt(fund.saved.amountMinor);
  return (
    <>
      <p>
        {fund.status} · {fund.currency}
      </p>
      <dl>
        <dt>Meta</dt>
        <dd>{money(fund.target)}</dd>
        <dt>Ahorrado</dt>
        <dd>{money(fund.saved)}</dd>
        <dt>Por ahorrar</dt>
        <dd>
          {money({
            currency: fund.currency,
            amountMinor: remaining > BigInt(0) ? remaining.toString() : "0",
          })}
        </dd>
        <dt>Progreso</dt>
        <dd>{percentUsed(fund.saved.amountMinor, fund.target.amountMinor)}</dd>
        {fund.targetDate && (
          <>
            <dt>Fecha objetivo</dt>
            <dd>
              <time dateTime={fund.targetDate}>{fund.targetDate}</time>
            </dd>
          </>
        )}
        {fund.recommended && (
          <>
            <dt>Aporte mensual sugerido</dt>
            <dd>{money(fund.recommended)}</dd>
          </>
        )}
      </dl>
    </>
  );
}
