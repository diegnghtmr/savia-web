"use client";

import { useActionState, useState } from "react";
import { ACCOUNT_TYPES, INFORMAL_DEBT_DIRECTIONS } from "@/lib/account-types";
import { useHydrated } from "@/lib/use-hydrated";
import { createAccountAction } from "../_actions/accounts";

export function AccountForm({
  nonce,
  workspaceId,
}: {
  nonce: string;
  workspaceId: string;
}) {
  const hydrated = useHydrated();
  const [submission] = useState({ nonce, workspaceId });
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState("");
  const [type, setType] = useState("cash");
  const [counterparty, setCounterparty] = useState("");
  const [direction, setDirection] = useState("");
  const [opening, setOpening] = useState("");
  const [date, setDate] = useState("");
  const [error, submit, pending] = useActionState(
    createAccountAction.bind(null, submission),
    null,
  );
  return (
    <form
      action={submit}
      aria-label="Crear cuenta"
      data-enhanced={hydrated || undefined}
    >
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
      {type === "informal_debt" && (
        <fieldset>
          <legend>Detalles de la deuda informal (opcionales)</legend>
          <p className="hint">
            Indica la contraparte y la dirección, o deja ambos campos vacíos.
          </p>
          <label className="field">
            Contraparte
            <input
              name="counterpartyName"
              maxLength={120}
              value={counterparty}
              onChange={(event) => setCounterparty(event.target.value)}
            />
          </label>
          <label className="field">
            Dirección
            <select
              name="direction"
              value={direction}
              onChange={(event) => setDirection(event.target.value)}
            >
              <option value="">Sin especificar</option>
              {Object.entries(INFORMAL_DEBT_DIRECTIONS).map(
                ([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ),
              )}
            </select>
          </label>
        </fieldset>
      )}
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
      <div className="field">
        <label htmlFor="opening-balance">Saldo inicial (opcional)</label>
        <input
          id="opening-balance"
          name="openingBalance"
          inputMode="decimal"
          aria-describedby="opening-hint"
          value={opening}
          onChange={(event) => setOpening(event.target.value)}
        />
        <p className="hint" id="opening-hint">
          Escribe el importe en la moneda de la cuenta, sin separadores de
          miles.
        </p>
      </div>
      <div className="field">
        <label htmlFor="opening-date">Fecha del saldo inicial (opcional)</label>
        <input
          id="opening-date"
          name="openingBalanceDate"
          type="date"
          value={date}
          onChange={(event) => setDate(event.target.value)}
        />
      </div>
      <button className="submit" type="submit" disabled={pending}>
        {pending ? "Creando cuenta…" : "Crear cuenta"}
      </button>
    </form>
  );
}
