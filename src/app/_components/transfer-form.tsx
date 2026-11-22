"use client";

import { useActionState, useState } from "react";
import { recordTransfer } from "../_actions/transfers";
import { DraftReceipt } from "./draft-receipt";

export function TransferForm({
  bound,
  accounts,
}: {
  bound: Parameters<typeof recordTransfer>[0];
  accounts: Map<string, string>;
}) {
  const [submitted] = useState(bound);
  const [values, setValues] = useState<Record<string, string>>({});
  const [result, action, pending] = useActionState(
    recordTransfer.bind(null, submitted),
    null,
  );
  const value = (key: string) => values[key] ?? "";
  const control = (key: string) => ({
    id: `transfer-${key}`,
    name: key,
    value: value(key),
    onChange: (
      event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
    ) => setValues({ ...values, [key]: event.target.value }),
  });
  const from = submitted.currencies[value("sourceAccountId")];
  const to = submitted.currencies[value("destinationAccountId")];
  const cross = from && to && from !== to;
  if (result?.receipt)
    return (
      <>
        <p className="outcome outcome-success" role="status">
          Transferencia registrada.
        </p>
        <DraftReceipt id={result.receipt} />
        <form method="get" action="/transfers">
          <button className="submit" type="submit">
            Nueva transferencia
          </button>
        </form>
      </>
    );
  const fields = [
    ["amount", "Importe de origen", "decimal", true],
    ...(cross
      ? ([
          ["destinationAmount", "Importe recibido", "decimal", true],
          ["executedRate", "Tasa ejecutada", "decimal", true],
          ["referenceRate", "Tasa de referencia (opcional)", "decimal", false],
        ] as const)
      : []),
    ["fee", "Comisión (opcional)", "decimal", false],
    ["date", "Fecha (UTC)", "date", true],
    ["description", "Descripción (opcional)", "text", false],
  ] as const;
  return (
    <form action={action}>
      {result?.error && (
        <p role="alert" className="outcome outcome-error">
          {result.error}
        </p>
      )}
      {(
        [
          ["sourceAccountId", "Cuenta de origen"],
          ["destinationAccountId", "Cuenta de destino"],
        ] as const
      ).map(([key, label]) => (
        <div className="field" key={key}>
          <label htmlFor={`transfer-${key}`}>{label}</label>
          <select {...control(key)} required>
            <option value="">Selecciona una cuenta</option>
            {Object.entries(submitted.currencies).map(([id, currency]) => (
              <option key={id} value={id}>
                {accounts.get(id)} ({currency})
              </option>
            ))}
          </select>
        </div>
      ))}
      {from && (
        <p>
          El importe de origen y la comisión se expresan en {from}
          {cross && `; el importe recibido, en ${to}`}.
        </p>
      )}
      {fields.map(([key, label, kind, required]) => (
        <div className="field" key={key}>
          <label htmlFor={`transfer-${key}`}>{label}</label>
          <input
            {...control(key)}
            type={kind === "date" ? "date" : "text"}
            inputMode={kind === "decimal" ? "decimal" : undefined}
            required={required}
            maxLength={key === "description" ? 500 : undefined}
          />
        </div>
      ))}
      <button className="submit" type="submit" disabled={pending}>
        {pending ? "Registrando…" : "Registrar transferencia"}
      </button>
    </form>
  );
}
