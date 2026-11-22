import Link from "next/link";
import { DataForm } from "@/app/_components/data-form";
import { dataAccess, dataId, dataObject } from "@/lib/data-access";
import { cursorWorkspace } from "@/lib/funds-gateway";
import { record } from "@/lib/insights-gateway";
import { parsePage } from "@/lib/transactions-gateway";
import { viewFilters, type SearchParams } from "@/lib/view-filters";

function Dates() {
  return (
    <>
      <label className="field">
        Desde
        <input type="date" name="from" />
      </label>
      <label className="field">
        Hasta
        <input type="date" name="to" />
      </label>
    </>
  );
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const input = await searchParams;
  const filters = viewFilters(input, {});
  const cursor = filters?.get("cursor");
  const cursorSpace = cursor ? cursorWorkspace(cursor) : null;
  const invalid = <p role="alert">Revisa los filtros de informes.</p>;
  if (
    !filters ||
    (cursor && !cursorSpace) ||
    Object.keys(input).some((key) => key !== "cursor" && key !== "limit")
  )
    return invalid;
  const access = await dataAccess();
  if (!access) return <p role="alert">No hay un espacio activo disponible.</p>;
  const workspaceId = access.workspace.id;
  if (cursorSpace && cursorSpace !== workspaceId) return invalid;
  const response = await access.request("report-definitions", filters);
  const body = response?.status === 200 ? await dataObject(response) : null;
  const reports = parsePage(body, (value) => {
    const row = record(value);
    const id = dataId(row?.id);
    return id && typeof row?.name === "string" && row.name.trim()
      ? { id, name: row.name }
      : null;
  });
  const next = reports?.cursor;
  if (next && cursorWorkspace(next) === workspaceId && next !== cursor)
    filters.set("cursor", next);
  else filters.delete("cursor");
  return (
    <>
      <h1>Informes</h1>
      <p className="eyebrow">{access.workspace.name}</p>
      <h2>Guardar definición</h2>
      <DataForm
        bound={{ workspaceId, kind: "report-create" }}
        label="Guardar informe"
        resultLabel="Ver informes"
      >
        <label className="field">
          Nombre del informe
          <input name="name" maxLength={120} required />
        </label>
        <label className="field">
          Dimensión
          <select name="dimension">
            <option value="month">Mes</option>
            <option value="category">Categoría</option>
            <option value="account">Cuenta</option>
          </select>
        </label>
        <label className="field">
          Medida
          <select name="measure">
            <option value="sum">Suma</option>
            <option value="count">Cantidad</option>
          </select>
        </label>
      </DataForm>
      <h2>Definiciones guardadas</h2>
      {!reports ? (
        <p role="alert">No pudimos listar los informes.</p>
      ) : !reports.items.length ? (
        <p>No hay informes guardados.</p>
      ) : (
        <ul>
          {reports.items.map(({ id, name }) => (
            <li key={id}>
              <h3>{name}</h3>
              <DataForm
                bound={{ workspaceId, kind: "report-run", id }}
                label={`Ejecutar ${name}`}
                resultLabel="Ver ejecución"
              >
                <Dates />
                <label className="field">
                  Formato
                  <select name="format">
                    <option value="pdf">PDF</option>
                    <option value="csv">CSV</option>
                    <option value="json">JSON</option>
                  </select>
                </label>
              </DataForm>
            </li>
          ))}
        </ul>
      )}
      {filters.has("cursor") && (
        <Link href={`/reports?${filters}`} prefetch={false}>
          Siguiente
        </Link>
      )}
      <h2>Exportar transacciones</h2>
      <DataForm
        bound={{ workspaceId, kind: "export" }}
        label="Exportar transacciones"
        resultLabel="Ver exportación"
      >
        <Dates />
      </DataForm>
      {access.workspace.isOwner && (
        <>
          <h2>Respaldo completo</h2>
          <DataForm
            bound={{ workspaceId, kind: "backup" }}
            label="Crear respaldo completo"
            resultLabel="Ver respaldo"
          >
            <p>Se solicitará un ZIP de todo este espacio, sin filtros.</p>
          </DataForm>
        </>
      )}
    </>
  );
}
