import type { ReactNode } from "react";
import type { FxProvenance } from "@/lib/fx-provenance";
import type { InsightsPeriod } from "@/lib/insights-period";

export function InsightsPeriodForm({
  period,
  children,
}: {
  period?: InsightsPeriod;
  children?: ReactNode;
}) {
  return (
    <form method="get" aria-label="Período de consulta">
      <div className="field">
        <label htmlFor="insights-from">Desde</label>
        <input
          id="insights-from"
          name="from"
          type="date"
          required
          defaultValue={period?.from}
        />
      </div>
      <div className="field">
        <label htmlFor="insights-to">Hasta</label>
        <input
          id="insights-to"
          name="to"
          type="date"
          required
          defaultValue={period?.to}
        />
      </div>
      {children}
      <button className="submit" type="submit">
        Aplicar período
      </button>
    </form>
  );
}

const freshnessLabels = {
  fresh: "Vigente",
  stale: "Vencida",
  unknown: "Desconocida",
};

export function FxFreshness({
  rates,
  fallback = true,
}: {
  rates?: FxProvenance;
  fallback?: boolean;
}) {
  if (!rates)
    return fallback ? <p>Vigencia de las conversiones: desconocida</p> : null;
  return (
    <table>
      <caption>Tipos de cambio utilizados</caption>
      <thead>
        <tr>
          {[
            "Par",
            "Tipo de cambio",
            "Fecha (UTC)",
            "Fuente",
            "Vigencia al valorar",
          ].map((heading) => (
            <th key={heading} scope="col">
              {heading}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rates.map(
          ({
            baseCurrency,
            quoteCurrency,
            rate,
            rateDate,
            source,
            freshness,
          }) => (
            <tr
              key={JSON.stringify([
                baseCurrency,
                quoteCurrency,
                rate,
                rateDate,
                source,
                freshness,
              ])}
            >
              <th scope="row">
                {baseCurrency} / {quoteCurrency}
              </th>
              <td>{rate}</td>
              <td>{rateDate}</td>
              <td>{source}</td>
              <td>{freshnessLabels[freshness]}</td>
            </tr>
          ),
        )}
      </tbody>
    </table>
  );
}
