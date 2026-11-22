import Link from "next/link";
import { redirect } from "next/navigation";
import {
  FxFreshness,
  InsightsPeriodForm,
} from "@/app/_components/insights-period-form";
import { readBalanceProjection } from "@/lib/balance-projection-report";
import { readCashFlow } from "@/lib/cash-flow-report";
import { readSummary } from "@/lib/insights-gateway";
import { insightsPeriod } from "@/lib/insights-period";
import { requireProfile } from "@/lib/require-profile";
import type { SearchParams } from "@/lib/view-filters";
import { readWorkspaceContext } from "@/lib/workspace-context";
import { BalanceProjection } from "./projection";
import { CashFlow, IncomeAndExpense } from "./reports";

export const metadata = { title: "Analítica" };
export const dynamic = "force-dynamic";

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const period = insightsPeriod(await searchParams);
  if (!period) {
    return (
      <>
        <h1>Analítica</h1>
        <p role="alert">Revisa el período.</p>
        <InsightsPeriodForm />
      </>
    );
  }
  const profile = await requireProfile();
  if (profile.kind === "failed")
    return <p role="alert">No pudimos cargar Savia.</p>;
  const scope = await readWorkspaceContext(profile.accessToken);
  if (scope.kind === "unauthenticated") redirect("/sign-in");
  if (scope.kind !== "ok" || !scope.active)
    return <p role="alert">No hay un espacio activo disponible.</p>;
  const [summary, cashFlow, projection] = await Promise.all([
    readSummary(profile.accessToken, scope.active, period),
    readCashFlow(profile.accessToken, scope.active, period),
    readBalanceProjection(profile.accessToken, scope.active, period),
  ]);
  return (
    <>
      <p className="eyebrow">{scope.active.name}</p>
      <h1>Analítica</h1>
      <InsightsPeriodForm period={period} />
      <FxFreshness />
      <IncomeAndExpense summary={summary} />
      <CashFlow report={cashFlow} />
      <BalanceProjection report={projection} />
      <p>
        <Link href="/analytics/scenarios" prefetch={false}>
          Escenarios
        </Link>
      </p>
    </>
  );
}
