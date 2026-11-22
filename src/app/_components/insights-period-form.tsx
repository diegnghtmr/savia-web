import type { InsightsPeriod } from "@/lib/insights-period";

export function InsightsPeriodForm({ period }: { period?: InsightsPeriod }) {
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
      <button className="submit" type="submit">
        Aplicar período
      </button>
    </form>
  );
}

export function FxFreshness() {
  return <p>Vigencia de las conversiones: desconocida</p>;
}
