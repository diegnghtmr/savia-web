import { FxFreshness } from "@/app/_components/insights-period-form";
import { money } from "@/lib/account-money";
import type { readCashFlow } from "@/lib/cash-flow-report";
import type { readSummary } from "@/lib/insights-gateway";

export function IncomeAndExpense({
  summary,
}: {
  summary: Awaited<ReturnType<typeof readSummary>>;
}) {
  return (
    <section aria-labelledby="analytics-comparison">
      <h2 id="analytics-comparison">Ingresos frente a gastos</h2>
      {summary ? (
        <dl>
          <dt>Ingresos del período</dt>
          <dd>{money(summary.income)}</dd>
          <dt>Gastos del período</dt>
          <dd>{money(summary.expenses)}</dd>
        </dl>
      ) : (
        <p role="alert">No pudimos cargar los ingresos y gastos.</p>
      )}
      <FxFreshness rates={summary?.fxRates} fallback={false} />
    </section>
  );
}

export function CashFlow({
  report,
  unit,
}: {
  report: Awaited<ReturnType<typeof readCashFlow>>;
  unit: string;
}) {
  if (report === "unavailable")
    return <p role="alert">El flujo de caja no está disponible.</p>;
  if (!report) return <p role="alert">No pudimos cargar el flujo de caja.</p>;
  return (
    <>
      {report.categories.length > 0 ? (
        <table>
          <caption>Gastos por categoría en el período</caption>
          <thead>
            <tr>
              <th scope="col">Categoría</th>
              <th scope="col">Gasto neto</th>
              <th scope="col">Porcentaje del gasto</th>
            </tr>
          </thead>
          <tbody>
            {report.categories.map(({ id, name, total, percent }) => (
              <tr key={id}>
                <th scope="row">{name}</th>
                <td>{money(total)}</td>
                <td>{percent.toLocaleString("es-CO")} %</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p>No hay gastos por categoría para este período.</p>
      )}
      {report.points.length > 0 && (
        <table>
          <caption>Flujo neto por {unit}</caption>
          <thead>
            <tr>
              <th scope="col">Inicio del {unit} (UTC)</th>
              <th scope="col">Flujo neto</th>
            </tr>
          </thead>
          <tbody>
            {report.points.map(({ start, net }) => (
              <tr key={start}>
                <th scope="row">{start}</th>
                <td>{money(net)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <FxFreshness rates={report.fxRates} fallback={false} />
    </>
  );
}
