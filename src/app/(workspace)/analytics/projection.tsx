import { money } from "@/lib/account-money";
import type { readBalanceProjection } from "@/lib/balance-projection-report";

export function BalanceProjection({
  report,
}: {
  report: Awaited<ReturnType<typeof readBalanceProjection>>;
}) {
  return (
    <section aria-labelledby="analytics-projection">
      <h2 id="analytics-projection">Proyección de saldo</h2>
      {!report || report.months.length === 0 ? (
        <p>Proyección no disponible.</p>
      ) : (
        <>
          <p>Estimación, no saldo observado.</p>
          <p>Extrapolación basada en {report.basisMonths} meses del período.</p>
          <p>Saldo inicial: {money(report.opening)}</p>
          <table>
            <caption>Saldo estimado por mes</caption>
            <thead>
              <tr>
                <th scope="col">Inicio del mes (UTC)</th>
                <th scope="col">Saldo estimado</th>
              </tr>
            </thead>
            <tbody>
              {report.months.map(({ month, balance }) => (
                <tr key={month}>
                  <th scope="row">{month}</th>
                  <td>{money(balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}
