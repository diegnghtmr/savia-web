"use client";

import Link from "next/link";
import { unavailableDraft, useDraftAction } from "@/lib/draft-client";
import { payDebt, type PaymentBinding } from "../_actions/debt-payment";
import { DraftReceipt } from "./draft-receipt";
import { DraftSubmit } from "./draft-submit";

const splits = [
  ["principalAmount", "Capital"],
  ["interestAmount", "Interés"],
  ["feeAmount", "Comisión"],
] as const;
export function DebtPaymentForm({
  bound,
  accounts,
}: {
  bound: PaymentBinding;
  accounts: [string, string][];
}) {
  const [state, submit, pending] = useDraftAction(
    "debt-payment",
    bound,
    payDebt.bind(null, bound),
    { error: unavailableDraft },
  );
  if (state?.receipt)
    return (
      <>
        <p role="status">Pago registrado.</p>
        <DraftReceipt id={state.receipt} />
        <Link href={`/debts/${bound.id}`} prefetch={false}>
          Ver deuda
        </Link>
      </>
    );
  return (
    <form
      aria-label="Registrar pago"
      action={submit}
      onReset={(event) => event.preventDefault()}
    >
      {state?.error && (
        <p role="alert" className="outcome outcome-error">
          {state.error}
        </p>
      )}
      <fieldset disabled={pending}>
        <label className="field">
          Cuenta de origen
          <select name="accountId" required>
            <option value="">Selecciona una cuenta</option>
            {accounts.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Total ({bound.currency})
          <input name="totalAmount" required inputMode="decimal" />
        </label>
        <p className="hint" id="debt-split-hint">
          Si dejas el capital en blanco, se aplica el total menos los intereses
          y la comisión. Si lo indicas, el desglose debe sumar el total.
        </p>
        {splits.map(([name, label]) => (
          <label key={name} className="field">
            {label} (opcional)
            <input
              name={name}
              inputMode="decimal"
              aria-describedby="debt-split-hint"
            />
          </label>
        ))}
        <label className="field">
          Fecha (UTC)
          <input name="date" type="date" required />
        </label>
        <DraftSubmit
          pending={pending}
          label={pending ? "Guardando…" : "Registrar pago"}
          confirmation={state?.confirmation}
        />
      </fieldset>
    </form>
  );
}
