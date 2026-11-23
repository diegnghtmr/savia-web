import { notFound } from "next/navigation";
import { DataForm } from "@/app/_components/data-form";
import { JobPoll } from "@/app/_components/job-poll";
import {
  dataAccess,
  dataAccounts,
  dataId,
  dataObject,
} from "@/lib/data-access";

const classifications = [
  ["totalRows", "Total"],
  ["validRows", "Válidas"],
  ["duplicateRows", "Duplicadas"],
  ["errorRows", "Con errores"],
] as const;
const columns = [
  ["date", "Columna de fecha"],
  ["amount", "Columna de importe"],
  ["description", "Columna de descripción"],
  ["debitCreditIndicator", "Columna de débito/crédito (si aplica)"],
] as const;

export default async function ImportJobPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const id = dataId((await params).jobId);
  if (!id) notFound();
  const access = await dataAccess();
  const response = await access?.request(`import-jobs/${id}`);
  if (response?.status === 404) notFound();
  const job = response?.status === 200 ? await dataObject(response) : null;
  if (!access || !job || dataId(job.id) !== id)
    return <p role="alert">No pudimos consultar la importación.</p>;
  const { status } = job;
  const reviewable =
    status === "awaiting_mapping" || status === "awaiting_confirmation";
  const pending = ["uploaded", "analyzing", "processing"].some(
    (state) => status === state,
  );
  const workspaceId = access.workspace.id;
  const accounts = reviewable ? await dataAccounts(access) : [];
  const headers = Array.isArray(job.sourceColumns)
    ? [...new Set((job.sourceColumns as unknown[]).filter(validColumn))]
    : [];
  return (
    <>
      <h1>Estado de importación</h1>
      {pending ? (
        <>
          <p role="status">Procesando extracto…</p>
          <JobPoll />
        </>
      ) : status === "completed" ? (
        <p role="status">Importación completada.</p>
      ) : status === "rolled_back" ? (
        <p>La importación fue revertida.</p>
      ) : !reviewable ? (
        <p role="alert">No pudimos procesar el extracto.</p>
      ) : (
        <>
          <h2>Vista previa</h2>
          <ul>
            {classifications.map(([key, label]) => (
              <li key={key}>
                {label}: {count(job[key])}
              </li>
            ))}
          </ul>
          <p>La vista previa muestra totales por clasificación.</p>
          {accounts.length === 0 ? (
            <p role="alert">No hay cuentas activas disponibles.</p>
          ) : (
            <DataForm
              bound={{ workspaceId, kind: "import-commit", id }}
              label="Importar movimientos"
              resultLabel="Ver estado"
            >
              <label className="field">
                Cuenta de destino
                <select name="accountId" defaultValue="" required>
                  <option value="">Selecciona una cuenta</option>
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </select>
              </label>
              {columns.map(([field, label], index) => (
                <label key={field} className="field">
                  {label}
                  {headers.length ? (
                    <select
                      name={field}
                      defaultValue={headers.includes(field) ? field : ""}
                      required={index < 3}
                    >
                      <option value="">Selecciona una columna</option>
                      {headers.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input name={field} maxLength={120} required={index < 3} />
                  )}
                </label>
              ))}
              <label className="field">
                Formato de fecha
                <select name="dateFormat">
                  <option>YYYY-MM-DD</option>
                  <option>DD/MM/YYYY</option>
                  <option>MM/DD/YYYY</option>
                </select>
              </label>
              <label className="field">
                Signo del débito
                <select name="debitSign">
                  <option value="negative">Negativo</option>
                  <option value="positive">Positivo</option>
                  <option value="separate_column">Columna separada</option>
                </select>
              </label>
              <p>Se omitirán los candidatos duplicados.</p>
              <label>
                <input type="checkbox" name="accept" value="yes" required />
                Confirmo la importación
              </label>
            </DataForm>
          )}
        </>
      )}
    </>
  );
}

function validColumn(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 120;
}

function count(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : "No informado";
}
