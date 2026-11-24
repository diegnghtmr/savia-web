import Link from "next/link";
import { redirect } from "next/navigation";
import {
  FxFreshness,
  InsightsPeriodForm,
} from "@/app/_components/insights-period-form";
import { readAdvanced } from "@/lib/advanced-report";
import {
  analyticsFilters,
  dimensions,
  granularities,
  metrics,
  type AnalyticsFilters,
} from "@/lib/analytics-filters";
import { readBalanceProjection } from "@/lib/balance-projection-report";
import { readCashFlow } from "@/lib/cash-flow-report";
import { readSummary } from "@/lib/insights-gateway";
import { requireProfile } from "@/lib/require-profile";
import type { SearchParams } from "@/lib/view-filters";
import { readWorkspaceContext } from "@/lib/workspace-context";
import { Advanced } from "./advanced";
import { BalanceProjection } from "./projection";
import { CashFlow, IncomeAndExpense } from "./reports";

export const metadata = { title: "Analítica" };
export const dynamic = "force-dynamic";

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const filters = analyticsFilters(await searchParams);
  if (!filters || filters === "invalid-period") {
    return (
      <>
        <h1>Analítica</h1>
        <p role="alert">
          {filters === "invalid-period"
            ? "Revisa el período."
            : "Revisa los filtros."}
        </p>
        <AnalyticsForm />
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
  const { period, granularity, presentationCurrency, metric } = filters;
  const { accessToken } = profile;
  const workspace = scope.active;
  const [summary, cashFlow, projection, advanced] = await Promise.all([
    readSummary(
      accessToken,
      workspace,
      period,
      AbortSignal.timeout(5000),
      presentationCurrency,
    ),
    readCashFlow(accessToken, workspace, filters),
    readBalanceProjection(accessToken, workspace, filters),
    metric ? readAdvanced(accessToken, workspace, filters, metric) : null,
  ]);
  const hasRates =
    summary?.fxRates ||
    (cashFlow !== "unavailable" && cashFlow?.fxRates) ||
    projection?.fxRates ||
    (advanced !== "unavailable" && advanced?.fxRates);
  return (
    <>
      <p className="eyebrow">{workspace.name}</p>
      <h1>Analítica</h1>
      <AnalyticsForm filters={filters} />
      {!hasRates && <FxFreshness />}
      <IncomeAndExpense summary={summary} />
      <CashFlow
        report={cashFlow}
        unit={granularities[granularity].toLowerCase()}
      />
      {metric && <Advanced metric={metric} report={advanced} />}
      <BalanceProjection report={projection} />
      <p>
        <Link href="/analytics/scenarios" prefetch={false}>
          Escenarios
        </Link>
      </p>
    </>
  );
}

function AnalyticsForm({ filters }: { filters?: AnalyticsFilters }) {
  return (
    <InsightsPeriodForm period={filters?.period}>
      <label className="field">
        Agrupar flujo de caja por
        <select
          name="granularity"
          defaultValue={filters?.granularity ?? "month"}
        >
          {Object.entries(granularities).map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        Moneda de presentación (opcional)
        <input
          name="presentationCurrency"
          pattern="[A-Z]{3}"
          maxLength={3}
          defaultValue={filters?.presentationCurrency}
        />
      </label>
      <fieldset>
        <legend>Filtros de flujo de caja y métricas aplicables</legend>
        <p>
          Introduce los identificadores separados por comas. Deja vacío para
          incluir todos.
        </p>
        {Object.entries(dimensions).map(([key, label]) => (
          <label className="field" key={key}>
            {label}
            <input
              name={key}
              defaultValue={filters?.query.getAll(key).join(", ")}
            />
          </label>
        ))}
      </fieldset>
      <label className="field">
        Métrica avanzada
        <select name="metric" defaultValue={filters?.metric ?? ""}>
          <option value="">Selecciona una métrica</option>
          {Object.entries(metrics).map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
      </label>
    </InsightsPeriodForm>
  );
}
