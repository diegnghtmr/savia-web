import Link from "next/link";
import { Fragment, use } from "react";
import {
  FxFreshness,
  InsightsPeriodForm,
} from "@/app/_components/insights-period-form";
import { money } from "@/lib/account-money";
import { cardLabels, type readPreferences } from "@/lib/dashboard-preferences";
import type { readSummary } from "@/lib/insights-gateway";
import type { InsightsPeriod } from "@/lib/insights-period";

type Preferences = Exclude<
  Awaited<ReturnType<typeof readPreferences>>,
  string | null
>;
const defaults = [
  "net_worth",
  "income",
  "expenses",
  "savings_capacity",
  "budget_utilization",
] as const;

export function FinancialSummary({
  report,
}: {
  report: Promise<{
    summary: Awaited<ReturnType<typeof readSummary>>;
    period: InsightsPeriod;
    preferences: Preferences | null;
    presetUnavailable: boolean;
  }>;
}) {
  const { summary, period, preferences, presetUnavailable } = use(report);
  const values = summary && {
    net_worth: money(summary.netWorth),
    assets: summary.assets && money(summary.assets),
    debts: summary.debts && money(summary.debts),
    income: money(summary.income),
    expenses: money(summary.expenses),
    savings_capacity: money(summary.netFlow),
    budget_utilization:
      summary.budgetUse === null
        ? null
        : `${summary.budgetUse.toLocaleString("es-CO")} %`,
    account_balances: (
      <Link href="/accounts" prefetch={false}>
        Consultar cuentas
      </Link>
    ),
    upcoming_operations: (
      <a href="#overview-upcoming">Consultar próximas recurrencias</a>
    ),
    alerts: (
      <Link href="/notifications" prefetch={false}>
        Consultar notificaciones
      </Link>
    ),
    reconciliation_status: (
      <Link href="/transactions?status=reconciled" prefetch={false}>
        Consultar transacciones conciliadas
      </Link>
    ),
  };
  const visible =
    preferences?.cards.filter((card) => card.visible).map((card) => card.id) ??
    defaults;
  return (
    <>
      <InsightsPeriodForm period={period} />
      {presetUnavailable && (
        <p>
          No pudimos verificar la zona horaria del espacio para el período
          guardado. Se muestra el período predeterminado en UTC.
        </p>
      )}
      <section aria-labelledby="overview-financial-summary">
        <h2 id="overview-financial-summary">Resumen financiero</h2>
        {!values ? (
          <p role="alert">No pudimos cargar el resumen financiero.</p>
        ) : !visible.length ? (
          <p>No hay tarjetas visibles.</p>
        ) : (
          <>
            <dl>
              {visible.map((id) => (
                <Fragment key={id}>
                  <dt>{cardLabels[id]}</dt>
                  <dd>{values[id] ?? "No disponible"}</dd>
                </Fragment>
              ))}
            </dl>
            <FxFreshness rates={summary?.fxRates} />
          </>
        )}
      </section>
    </>
  );
}
