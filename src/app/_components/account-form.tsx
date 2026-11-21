"use client";

import { useActionState, useState } from "react";
import { ACCOUNT_TYPES } from "@/lib/account-types";
import { createAccountAction } from "../_actions/accounts";

export function AccountForm({
  nonce,
  workspaceId,
}: {
  nonce: string;
  workspaceId: string;
}) {
  const [submission] = useState({ nonce, workspaceId });
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState("");
  const [type, setType] = useState("cash");
  const [error, submit, pending] = useActionState(
    createAccountAction.bind(null, submission),
    null,
  );
  return (
    <form action={submit}>
      {error && (
        <p className="outcome outcome-error" role="alert">
          {error}
        </p>
      )}
      <div className="field">
        <label htmlFor="account-name">Nombre de la cuenta</label>
        <input
          id="account-name"
          name="name"
          maxLength={120}
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="account-type">Tipo de cuenta</label>
        <select
          id="account-type"
          name="type"
          value={type}
          onChange={(e) => setType(e.target.value)}
        >
          {Object.entries(ACCOUNT_TYPES).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="account-currency">Moneda</label>
        <input
          id="account-currency"
          name="currency"
          maxLength={3}
          pattern="[A-Za-z]{3}"
          placeholder="COP"
          required
          value={currency}
          onChange={(e) => setCurrency(e.target.value)}
        />
      </div>
      <button className="submit" type="submit" disabled={pending}>
        {pending ? "Creando cuenta…" : "Crear cuenta"}
      </button>
    </form>
  );
}
