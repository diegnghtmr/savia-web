"use client";

import { useActionState, useState } from "react";
import { recordRate } from "../_actions/exchange-rates";
import { DraftReceipt } from "./draft-receipt";

const inputs = [
  ["baseCurrency", "Moneda base", "text", 3],
  ["quoteCurrency", "Moneda cotizada", "text", 3],
  ["rate", "Tasa", "text", 40],
  ["effectiveAt", "Fecha y hora (UTC)", "datetime-local", undefined],
  ["notes", "Notas (opcional)", "text", 500],
] as const;

export function ExchangeRateForm({ workspaceId }: { workspaceId: string }) {
  const [bound] = useState(workspaceId);
  const [values, setValues] = useState<Record<string, string>>({});
  const [state, submit, pending] = useActionState(
    recordRate.bind(null, bound),
    null,
  );
  if (state?.receipt)
    return (
      <>
        <p role="status">Tasa manual registrada.</p>
        <DraftReceipt id={state.receipt} />
        <form action="/exchange-rates" method="get">
          <button className="submit" type="submit">
            Crear otra tasa
          </button>
        </form>
      </>
    );
  return (
    <form action={submit} aria-label="Nueva tasa manual">
      {state?.error && (
        <p className="outcome outcome-error" role="alert">
          {state.error}
        </p>
      )}
      {inputs.map(([key, label, type, maxLength]) => (
        <div className="field" key={key}>
          <label htmlFor={`rate-${key}`}>{label}</label>
          <input
            id={`rate-${key}`}
            name={key}
            type={type}
            required={key !== "notes"}
            inputMode={key === "rate" ? "decimal" : undefined}
            maxLength={maxLength}
            value={values[key] ?? ""}
            onChange={(event) =>
              setValues({ ...values, [key]: event.target.value })
            }
          />
        </div>
      ))}
      <button type="submit" className="submit" disabled={pending}>
        {pending ? "Guardando…" : "Guardar tasa manual"}
      </button>
    </form>
  );
}
