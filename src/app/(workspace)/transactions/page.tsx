import Link from "next/link";
import { CapabilityReceipt } from "@/app/_components/capability-receipt";
import { requireProfile } from "@/lib/require-profile";
import {
  ledgerFilters,
  ledgerScope,
  statuses,
} from "@/lib/transactions-gateway";
import type { SearchParams } from "@/lib/view-filters";
import { canWriteWorkspace } from "@/lib/workspace-roles";
import { BulkForm } from "./bulk-form";
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
  const { lote, guardado, ...query } = await searchParams;
  const filters = ledgerFilters(query);
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
  const binding = { userId: profile.userId, workspaceId: scope.workspaceId };
  const names = new Map<string, string>(
    canWriteWorkspace(scope.role)
      ? page.items.flatMap((row) =>
          row.version && row.statusCode !== "voided"
            ? [
                [
                  `${row.id}:${row.version}`,
                  row.description || row.type,
                ] as const,
              ]
            : [],
        )
      : [],
  );
  const rows = (
    <ul>
      {page.items.map((row) => {
        const target = `${row.id}:${row.version}`;
        return (
          <li key={row.id}>
            <h2>
              <Link href={`/transactions/${row.id}`} prefetch={false}>
                {row.description || row.type}
              </Link>
            </h2>
            {names.has(target) && (
              <label className="field field-inline">
                <input name="target" type="checkbox" value={target} />
                Seleccionar {names.get(target)}
              </label>
            )}
            <TransactionSummary row={row} labels={labels} />
          </li>
        );
      })}
    </ul>
  );
  return (
    <>
      <p className="eyebrow">Espacio: {scope.name}</p>
      <h1>Transacciones</h1>
      {lote === "conflicto" && (
        <p role="alert">
          Alguna transacción cambió. Revisa la lista actualizada antes de volver
          a intentarlo.
        </p>
      )}
      {guardado && <CapabilityReceipt requested={guardado} {...binding} />}
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
      {names.size ? (
        <BulkForm
          key={`${scope.workspaceId}:${[...names.keys()].join(",")}`}
          binding={binding}
          names={names}
          categories={labels.categories}
          payees={labels.payees}
          tags={labels.tags}
        >
          {rows}
        </BulkForm>
      ) : page.items.length ? (
        rows
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
