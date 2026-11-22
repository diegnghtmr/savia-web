import { use } from "react";
import { FxFreshness } from "@/app/_components/insights-period-form";
import { money } from "@/lib/account-money";
import type { readSummary } from "@/lib/insights-gateway";

export function FinancialSummary({
  report,
}: {
  report: ReturnType<typeof readSummary>;
}) {
  const summary = use(report);
  return (
    <section aria-labelledby="overview-financial-summary">
      <h2 id="overview-financial-summary">Resumen financiero</h2>
      {!summary ? (
        <p role="alert">No pudimos cargar el resumen financiero.</p>
      ) : (
        <>
          <dl>
            <dt>Patrimonio neto</dt>
            <dd>{money(summary.netWorth)}</dd>
            <dt>Ingresos del período</dt>
            <dd>{money(summary.income)}</dd>
            <dt>Gastos del período</dt>
            <dd>{money(summary.expenses)}</dd>
            <dt>Flujo neto del período</dt>
            <dd>{money(summary.netFlow)}</dd>
            <dt>Uso del presupuesto</dt>
            <dd>
              {summary.budgetUse === null
                ? "No disponible"
                : `${summary.budgetUse.toLocaleString("es-CO")} %`}
            </dd>
          </dl>
          <FxFreshness />
        </>
      )}
    </section>
  );
}
