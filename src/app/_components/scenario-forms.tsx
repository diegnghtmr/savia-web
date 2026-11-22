"use client";

import { useActionState } from "react";
import { createExpenseScenario, runScenario } from "@/app/_actions/scenarios";
import { money } from "@/lib/account-money";

export function ScenarioSimulation({
  name,
  bound,
}: {
  name: string;
  bound: Parameters<typeof runScenario>[0];
}) {
  const [result, simulate, pending] = useActionState(
    runScenario.bind(null, bound),
    null,
  );
  const finished = result !== null && typeof result !== "string";
  return (
    <>
      <form action={simulate}>
        <button className="submit" type="submit" disabled={pending || finished}>
          Simular {name}
        </button>
      </form>
      {typeof result === "string" && <p role="alert">{result}</p>}
      {result && typeof result !== "string" && (
        <>
          {result.kind === "failed" ? (
            <p role="alert">No se aplicaron los supuestos del escenario.</p>
          ) : (
            <>
              <p>
                Período de referencia: {result.from} a {result.to}
              </p>
              <table>
                <caption>Resultado de {name}</caption>
                <thead>
                  <tr>
                    <th scope="col">Indicador</th>
                    <th scope="col">Base</th>
                    <th scope="col">Escenario</th>
                    <th scope="col">Diferencia</th>
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map(({ label, amounts }) => (
                    <tr key={label}>
                      <th scope="row">{label}</th>
                      <td>{money(amounts[0])}</td>
                      <td>{money(amounts[1])}</td>
                      <td>{money(amounts[2])}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          {result.risks.length > 0 && (
            <ul aria-label="Riesgos del escenario">
              {result.risks.map((risk) => (
                <li key={risk}>{risk}</li>
              ))}
            </ul>
          )}
          <p>Recarga esta página para volver a simular.</p>
        </>
      )}
    </>
  );
}

export function ScenarioCreation({
  bound,
}: {
  bound: Parameters<typeof createExpenseScenario>[0];
}) {
  const [error, create, pending] = useActionState(
    createExpenseScenario.bind(null, bound),
    null,
  );
  return (
    <form action={create} aria-label="Nuevo escenario de gastos">
      <div className="field">
        <label htmlFor="scenario-name">Nombre del escenario</label>
        <input id="scenario-name" name="name" required maxLength={120} />
      </div>
      <div className="field">
        <label htmlFor="scenario-change">
          Cambio de gasto mensual ({bound.currency})
        </label>
        <p id="scenario-change-hint" className="hint">
          Usa un importe negativo para simular una reducción de gastos.
        </p>
        <input
          id="scenario-change"
          name="change"
          inputMode="decimal"
          aria-describedby="scenario-change-hint"
          required
        />
      </div>
      {error && <p role="alert">{error}</p>}
      <button className="submit" type="submit" disabled={pending}>
        Crear escenario
      </button>
    </form>
  );
}
