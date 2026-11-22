import Link from "next/link";
import { ExchangeRateForm } from "@/app/_components/exchange-rate-form";
import { requireProfile } from "@/lib/require-profile";
import { ledgerScope } from "@/lib/transactions-gateway";
import {
  calendarDate,
  viewFilters,
  type SearchParams,
} from "@/lib/view-filters";
import { WORKSPACE_ID } from "@/lib/workspace-gateway";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tasas de cambio" };
const currency = (value: string) => /^[a-z]{3}$/i.test(value);

export default async function ExchangeRatesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const profile = await requireProfile();
  if (profile.kind === "failed")
    return <p role="alert">No pudimos consultar tu perfil.</p>;
  const input = await searchParams;
  const filters = viewFilters(input, {
    baseCurrency: currency,
    quoteCurrency: currency,
    from: calendarDate,
    to: calendarDate,
  });
  const from = filters?.get("from"),
    to = filters?.get("to");
  if (
    !filters ||
    input.limit !== undefined ||
    input.cursor !== undefined ||
    (from && to && from > to)
  )
    return (
      <p role="alert">
        Revisa los filtros. <Link href="/exchange-rates">Limpiar filtros</Link>
      </p>
    );
  for (const field of ["baseCurrency", "quoteCurrency"]) {
    const code = filters.get(field);
    if (code) filters.set(field, code.toUpperCase());
  }
  const scope = await ledgerScope(profile.accessToken);
  if (!scope) return <Link href="/overview">Revisa el espacio activo</Link>;
  const body = await scope.listExchangeRates(filters);
  const rates = Array.isArray(body) && body.every(isRate) ? body : null;
  const controls = [
    ["baseCurrency", "Moneda base"],
    ["quoteCurrency", "Moneda cotizada"],
    ["from", "Desde"],
    ["to", "Hasta"],
  ];
  return (
    <>
      <Link className="call-to-action" href="/transfers">
        Volver a Transferencias
      </Link>
      <p className="eyebrow">Espacio: {scope.name}</p>
      <h1>Tasas de cambio</h1>
      <form action="/exchange-rates" method="get" aria-label="Filtrar tasas">
        {controls.map(([name, label], index) => (
          <div className="field" key={name}>
            <label htmlFor={`fx-${name}`}>{label}</label>
            <input
              id={`fx-${name}`}
              name={name}
              type={index < 2 ? "text" : "date"}
              maxLength={index < 2 ? 3 : undefined}
              defaultValue={filters.get(name) ?? ""}
            />
          </div>
        ))}
        <button className="submit" type="submit">
          Filtrar
        </button>
      </form>
      {!rates ? (
        <p role="alert">No pudimos cargar las tasas.</p>
      ) : !rates.length ? (
        <p>No hay tasas para estos filtros.</p>
      ) : (
        <ul>
          {rates.map((rate) => (
            <li key={rate.id}>
              <h2 className="type-finance-md">
                1 {rate.baseCurrency} = {rate.rate} {rate.quoteCurrency}
              </h2>
              <p>
                Fuente: {rate.source}
                {rate.manual ? " (manual)" : ""}
              </p>
              <p>
                Fecha:{" "}
                <time dateTime={rate.effectiveAt}>{rate.effectiveAt}</time>
              </p>
              <p>
                Antigüedad:{" "}
                {rate.ageHours === undefined
                  ? "No disponible"
                  : `${String(rate.ageHours).replace(".", ",")} h`}
              </p>
              <p>
                Estado:{" "}
                <strong>
                  {rate.isStale === true
                    ? "Desactualizada"
                    : rate.isStale === false
                      ? "Vigente"
                      : "No disponible"}
                </strong>
              </p>
            </li>
          ))}
        </ul>
      )}
      <h2>Nueva tasa manual</h2>
      <ExchangeRateForm
        workspaceId={scope.workspaceId}
        key={scope.workspaceId}
      />
    </>
  );
}

type Rate = {
  id: string;
  baseCurrency: string;
  quoteCurrency: string;
  rate: string;
  effectiveAt: string;
  source: string;
  manual?: boolean;
  ageHours?: number;
  isStale?: boolean;
};
function isRate(value: unknown): value is Rate {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === "string" &&
    WORKSPACE_ID.test(row.id) &&
    typeof row.baseCurrency === "string" &&
    currency(row.baseCurrency) &&
    typeof row.quoteCurrency === "string" &&
    currency(row.quoteCurrency) &&
    typeof row.rate === "string" &&
    /^\d+(\.\d+)?$/.test(row.rate) &&
    typeof row.source === "string" &&
    typeof row.effectiveAt === "string" &&
    Number.isFinite(Date.parse(row.effectiveAt)) &&
    (row.ageHours === undefined ||
      (typeof row.ageHours === "number" && Number.isFinite(row.ageHours))) &&
    (row.isStale === undefined || typeof row.isStale === "boolean") &&
    (row.manual === undefined || typeof row.manual === "boolean")
  );
}
