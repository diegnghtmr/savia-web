"use client";

import Link from "next/link";
import { unavailableDraft, useDraftAction } from "@/lib/draft-client";
import { saveFund, type FundBinding } from "../_actions/funds";
import { DraftReceipt } from "./draft-receipt";
import { DraftSubmit } from "./draft-submit";

export function FundForm({
  bound,
  accounts,
}: {
  bound: FundBinding;
  accounts: [string, string][];
}) {
  const [state, submit, pending] = useDraftAction(
    "fund",
    bound,
    saveFund.bind(null, bound),
    { error: unavailableDraft },
  );
  const contribution = bound.contribution;
  const label = contribution ? "Registrar aporte" : "Crear fondo";
  if (state?.receipt)
    return (
      <>
        <p role="status">
          {contribution ? "Aporte registrado." : "Fondo creado."}
        </p>
        <DraftReceipt id={state.receipt} />
        <Link
          href={`/funds/${contribution?.id ?? state.receipt}`}
          prefetch={false}
        >
          Ver fondo
        </Link>
      </>
    );
  return (
    <form
      aria-label={label}
      action={submit}
      onReset={(event) => event.preventDefault()}
    >
      {state?.error && (
        <p role="alert" className="outcome outcome-error">
          {state.error}
        </p>
      )}
      <fieldset disabled={pending}>
        {!contribution && (
          <>
            <label className="field">
              Nombre
              <input name="name" required maxLength={120} />
            </label>
            <label className="field">
              Moneda
              <input
                name="currency"
                required
                pattern="[A-Za-z]{3}"
                placeholder="COP"
              />
            </label>
          </>
        )}
        <label className="field">
          {contribution ? `Importe (${contribution.currency})` : "Meta"}
          <input name="amount" required inputMode="decimal" />
        </label>
        <label className="field">
          {contribution ? "Cuenta de origen" : "Cuenta vinculada (opcional)"}
          <select
            name={contribution ? "accountId" : "linkedAccountId"}
            required={!!contribution}
          >
            <option value="">
              {contribution ? "Selecciona una cuenta" : "Sin cuenta vinculada"}
            </option>
            {accounts.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          {contribution ? "Fecha" : "Fecha objetivo (opcional)"}
          <input
            name={contribution ? "date" : "targetDate"}
            type="date"
            required={!!contribution}
          />
        </label>
        {contribution && (
          <label className="field">
            Notas (opcional)
            <textarea name="notes" maxLength={500} />
          </label>
        )}
        <DraftSubmit
          workspaceId={bound.workspaceId}
          label={pending ? "Guardando…" : label}
          pending={pending}
          confirmation={state?.confirmation}
        />
      </fieldset>
    </form>
  );
}
