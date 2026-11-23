import { FxFreshness } from "@/app/_components/insights-period-form";
import type { readAdvanced } from "@/lib/advanced-report";
import { metrics, type Metric } from "@/lib/analytics-filters";

export function Advanced({
  metric,
  report,
}: {
  metric: Metric;
  report: Awaited<ReturnType<typeof readAdvanced>>;
}) {
  const title = metrics[metric];
  return (
    <section aria-labelledby="advanced-title">
      <h2 id="advanced-title">{title}</h2>
      {report === "unavailable" ? (
        <p role="alert">La métrica no está disponible.</p>
      ) : !report ? (
        <p role="alert">No pudimos cargar esta métrica.</p>
      ) : (
        <>
          {report.explanation && <p>{report.explanation}</p>}
          {[
            ["Datos faltantes", report.missingData],
            ["Supuestos", report.assumptions],
          ].map(
            ([label, items]) =>
              Array.isArray(items) &&
              items.length > 0 && (
                <div key={String(label)}>
                  <h3>{label}</h3>
                  <ul>
                    {items.map((item, index) => (
                      <li key={`${index}:${item}`}>{item}</li>
                    ))}
                  </ul>
                </div>
              ),
          )}
          {report.tables.map(({ label, headings, rows }) =>
            rows.length ? (
              <table key={label ?? title}>
                <caption>{label ?? title}</caption>
                <thead>
                  <tr>
                    {headings.map((heading) => (
                      <th key={heading} scope="col">
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(([primary, ...cells], index) => (
                    <tr key={`${primary}:${index}`}>
                      <th scope="row">{primary}</th>
                      {cells.map((cell, column) => (
                        <td key={headings[column + 1]}>{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p key={label ?? title}>
                {label ?? title}: no hay datos para mostrar.
              </p>
            ),
          )}
          <FxFreshness rates={report.fxRates} fallback={false} />
        </>
      )}
    </section>
  );
}
