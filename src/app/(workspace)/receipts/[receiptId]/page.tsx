import { notFound } from "next/navigation";
import { DataForm } from "@/app/_components/data-form";
import { JobPoll } from "@/app/_components/job-poll";
import {
  dataAccess,
  dataAccounts,
  dataId,
  dataObject,
} from "@/lib/data-access";
import { record } from "@/lib/insights-gateway";
import { calendarDate } from "@/lib/view-filters";

const labels = [
  ["merchant", "Comercio"],
  ["date", "Fecha"],
  ["currency", "Moneda"],
  ["total", "Total"],
] as const;

function field(value: unknown) {
  const term = record(value);
  const item = term?.value;
  const confidence = term?.confidence;
  return {
    value:
      typeof item === "string"
        ? item.slice(0, 500)
        : typeof item === "number" && Number.isFinite(item)
          ? String(item)
          : "",
    confidence:
      typeof confidence === "number" && confidence >= 0 && confidence <= 1
        ? `${Math.round(confidence * 100)} %`
        : "No informada",
  };
}

export default async function ReceiptPage({
  params,
}: {
  params: Promise<{ receiptId: string }>;
}) {
  const id = dataId((await params).receiptId);
  if (!id) notFound();
  const access = await dataAccess();
  const response = await access?.request(`receipts/${id}`);
  if (response?.status === 404) notFound();
  const receipt = response?.status === 200 ? await dataObject(response) : null;
  if (!access || !receipt || dataId(receipt.id) !== id)
    return <p role="alert">No pudimos consultar el comprobante.</p>;
  const state = receipt.status;
  const reviewing = state === "awaiting_review" || state === "failed";
  const accounts = reviewing ? await dataAccounts(access) : [];
  const transaction = dataId(receipt.transactionId);
  const { value: date } = field(receipt.date);
  const { value: currency } = field(receipt.currency);
  const { value: total } = field(receipt.total);
  const { id: workspaceId, baseCurrency } = access.workspace;
  const initialCurrency = /^[A-Z]{3}$/.test(currency) ? currency : baseCurrency;
  const merchant = field(receipt.merchant).value;
  return (
    <>
      <h1>Revisar comprobante</h1>
      {state === "uploaded" || state === "processing" ? (
        <>
          <p role="status">Procesando comprobante…</p>
          <JobPoll />
        </>
      ) : state === "confirmed" && transaction ? (
        <a href={`/transactions/${transaction}`}>Ver transacción</a>
      ) : reviewing ? (
        <>
          {state === "failed" && (
            <p role="alert">
              No pudimos extraer los datos. Puedes completarlos manualmente.
            </p>
          )}
          <dl>
            {labels.map(([name, label]) => {
              const { value, confidence } = field(receipt[name]);
              const shown = value || "No informado";
              const detail = `${shown} · Confianza: ${confidence}`;
              return (
                <div key={name}>
                  <dt>{label}</dt>
                  <dd>{detail}</dd>
                </div>
              );
            })}
          </dl>
          {accounts.length === 0 ? (
            <p role="alert">No hay cuentas activas disponibles.</p>
          ) : (
            <DataForm
              bound={{ workspaceId, kind: "receipt-confirm", id }}
              label="Crear transacción"
              resultLabel="Ver transacción"
            >
              <label className="field">
                Cuenta de origen
                <select name="accountId" defaultValue="" required>
                  <option value="">Selecciona una cuenta</option>
                  {accounts.map(({ id, name, currency }) => (
                    <option key={id} value={id}>
                      {name} ({currency})
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                Importe
                <input
                  name="amount"
                  defaultValue={/^\d+(?:[.,]\d+)?$/.test(total) ? total : ""}
                  inputMode="decimal"
                  required
                />
              </label>
              <label className="field">
                Moneda (código)
                <input
                  name="currency"
                  defaultValue={initialCurrency}
                  pattern="[A-Z]{3}"
                  maxLength={3}
                  required
                />
              </label>
              <label className="field">
                Fecha del gasto
                <input
                  name="date"
                  type="date"
                  defaultValue={calendarDate(date) ? date : ""}
                  required
                />
              </label>
              <label className="field">
                Descripción
                <input
                  name="description"
                  maxLength={500}
                  defaultValue={merchant}
                />
              </label>
              <label>
                <input type="checkbox" name="accept" value="yes" required />
                Confirmo el gasto
              </label>
            </DataForm>
          )}
        </>
      ) : (
        <p role="alert">No pudimos verificar el estado del comprobante.</p>
      )}
    </>
  );
}
