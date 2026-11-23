import Link from "next/link";
import { requireProfile } from "@/lib/require-profile";
import {
  ledgerFilters,
  ledgerScope,
  statuses,
} from "@/lib/transactions-gateway";
import type { SearchParams } from "@/lib/view-filters";
import { TransactionSummary } from "./summary";

export const dynamic = "force-dynamic";
export const metadata = { title: "Transacciones" };

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const profile = await requireProfile();
  if (profile.kind === "failed")
    return <p role="alert">No pudimos consultar tu perfil.</p>;
  const filters = ledgerFilters(await searchParams);
  if (!filters) return <InvalidFilters />;
  const scope = await ledgerScope(profile.accessToken);
  if (!scope) return <Link href="/overview">Revisa el espacio activo</Link>;
  const page = await scope.listTransactions(filters);
  if (page === "invalid-filters") return <InvalidFilters />;
  const labels = page && (await scope.lookups());
  if (!page || !labels)
    return (
      <p role="alert">
        No pudimos cargar las transacciones. Vuelve a intentarlo.
      </p>
    );
  const selects = [
    ["accountId", "Cuenta", labels.accounts],
    ["categoryId", "Categoría", labels.categories],
    ["status", "Estado", new Map(Object.entries(statuses))],
  ] as const;
  if (page.cursor) filters.set("cursor", page.cursor);
  return (
    <>
      <p className="eyebrow">Espacio: {scope.name}</p>
      <h1>Transacciones</h1>
      <Link className="call-to-action" href="/transactions/new">
        Nueva transacción
      </Link>
      <Link className="call-to-action" href="/catalogs" prefetch={false}>
        Catálogos
      </Link>
      <form action="/transactions" method="get">
        {selects.map(([name, label, options]) => {
          const selected = filters.get(name) ?? "";
          return (
            <div className="field" key={name}>
              <label htmlFor={name}>{label}</label>
              <select id={name} name={name} defaultValue={selected}>
                <option value="">Todas</option>
                {selected && !options.has(selected) && (
                  <option value={selected}>No disponible</option>
                )}
                {Array.from(options, ([id, name]) => (
                  <option value={id} key={id}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
          );
        })}
        {(
          [
            ["from", "Desde"],
            ["to", "Hasta"],
            ["query", "Buscar"],
          ] as const
        ).map(([name, label]) => (
          <div className="field" key={name}>
            <label htmlFor={name}>{label}</label>
            <input
              id={name}
              name={name}
              type={name === "query" ? "search" : "date"}
              maxLength={name === "query" ? 200 : undefined}
              defaultValue={filters.get(name) ?? ""}
            />
          </div>
        ))}
        <button className="submit" type="submit">
          Filtrar
        </button>
      </form>
      {page.items.length ? (
        <ul>
          {page.items.map((row) => (
            <li key={row.id}>
              <h2>
                <Link href={`/transactions/${row.id}`} prefetch={false}>
                  {row.description || row.type}
                </Link>
              </h2>
              <TransactionSummary row={row} labels={labels} />
            </li>
          ))}
        </ul>
      ) : (
        <p>No hay transacciones en esta página.</p>
      )}
      {page.cursor && (
        <Link className="call-to-action" href={`/transactions?${filters}`}>
          Siguiente
        </Link>
      )}
    </>
  );
}

function InvalidFilters() {
  return (
    <p role="alert">
      Revisa los filtros. <Link href="/transactions">Limpiar filtros</Link>
    </p>
  );
}
