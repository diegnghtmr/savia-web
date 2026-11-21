"use client";

import { useActionState, useState } from "react";
import { createWorkspaceAction } from "../_actions/workspace";

export function WorkspaceRecovery({ nonce }: { nonce: string }) {
  const [formNonce] = useState(nonce);
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState("");
  const [error, submit, pending] = useActionState(
    createWorkspaceAction.bind(null, formNonce),
    null,
  );

  return (
    <form action={submit}>
      <div className="field">
        <label htmlFor="recovery-name">Nombre del espacio</label>
        <input
          id="recovery-name"
          name="name"
          maxLength={120}
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="recovery-currency">Moneda base</label>
        <p id="recovery-currency-hint" className="hint">
          Código de tres letras, como COP.
        </p>
        <input
          id="recovery-currency"
          name="baseCurrency"
          aria-describedby="recovery-currency-hint"
          maxLength={3}
          pattern="[A-Za-z]{3}"
          required
          value={currency}
          onChange={(event) => setCurrency(event.target.value)}
        />
      </div>
      {error && (
        <p className="outcome outcome-error" role="alert">
          {error}
        </p>
      )}
      <button className="submit" type="submit" disabled={pending}>
        {pending ? "Creando espacio…" : "Crear espacio"}
      </button>
    </form>
  );
}
