import { money } from "@/lib/account-money";
import {
  debtId,
  debtMoney,
  type Debt,
  type debtScope,
} from "@/lib/debts-gateway";
import { calendarDate } from "@/lib/view-filters";

type Request = NonNullable<Awaited<ReturnType<typeof debtScope>>>["request"];
const day = (value: unknown): value is string =>
  typeof value === "string" && calendarDate(value);

function parseProjection(value: unknown, debt: Debt) {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const { asOf, estimatedPayoffDate: payoff, schedule, debtId: id } = row;
  if (
    !debtId(id) ||
    id.toLowerCase() !== debt.id ||
    row.strategy !== "minimum_payment" ||
    !day(asOf) ||
    !day(payoff) ||
    payoff < asOf ||
    !Array.isArray(schedule)
  )
    return null;
  const exact = (value: unknown) => debtMoney(value, debt.currency);
  const starting = exact(row.startingBalance),
    interest = exact(row.totalInterest),
    cost = exact(row.totalCost);
  if (!starting || !interest || !cost) return null;
  const rows = [];
  let previous = asOf;
  for (const item of schedule as unknown[]) {
    if (!item || typeof item !== "object") return null;
    const {
      dueDate: due,
      paymentAmount,
      principalAmount,
      interestAmount,
      remainingBalance,
    } = item as Record<string, unknown>;
    const paid = exact(paymentAmount),
      principal = exact(principalAmount),
      interest = exact(interestAmount),
      balance = exact(remainingBalance);
    if (
      !day(due) ||
      due < previous ||
      due > payoff ||
      !paid ||
      !principal ||
      !interest ||
      !balance
    )
      return null;
    rows.push({ due, paid, principal, interest, balance });
    previous = due;
  }
  return { asOf, payoff, starting, interest, cost, rows };
}

export async function debtProjection(request: Request, debt: Debt) {
  const response = await request(`debts/${debt.id}/projection`, {
    signal: AbortSignal.timeout(5000),
  });
  if (response?.status === 404 || response?.status === 501)
    return <p>Proyección no disponible</p>;
  const projection =
    response?.status === 200 &&
    parseProjection(await response.json().catch(() => null), debt);
  if (!projection) return <p role="alert">No pudimos cargar la proyección.</p>;
  return (
    <section aria-labelledby="debt-projection">
      <h2 id="debt-projection">Proyección con pago mínimo</h2>
      <dl>
        <dt>Fecha de cálculo</dt>
        <dd>{projection.asOf}</dd>
        <dt>Saldo inicial</dt>
        <dd>{money(projection.starting)}</dd>
        <dt>Interés total</dt>
        <dd>{money(projection.interest)}</dd>
        <dt>Costo total</dt>
        <dd>{money(projection.cost)}</dd>
        <dt>Fecha estimada de liquidación</dt>
        <dd>{projection.payoff}</dd>
      </dl>
      {projection.rows.length > 0 && (
        <div
          className="overflow-x-auto"
          role="region"
          aria-label="Calendario estimado de pagos"
          tabIndex={0}
        >
          <table>
            <caption>Calendario estimado de pagos</caption>
            <thead>
              <tr>
                {["Fecha", "Pago", "Capital", "Interés", "Saldo"].map(
                  (label) => (
                    <th key={label} scope="col">
                      {label}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {projection.rows.map(
                ({ due, paid, principal, interest, balance }, index) => (
                  <tr key={`${due}:${index}`}>
                    <td>
                      <time dateTime={due}>{due}</time>
                    </td>
                    {[paid, principal, interest, balance].map(
                      (value, column) => (
                        <td key={column}>{money(value)}</td>
                      ),
                    )}
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
