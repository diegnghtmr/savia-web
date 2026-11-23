"use client";

import { useActionState, useState } from "react";
import {
  ACCOUNT_STALE,
  ACCOUNT_STATUSES,
  ACCOUNT_TEXT,
  type AccountEdit,
} from "@/lib/account-types";
import { useHydrated } from "@/lib/use-hydrated";
import { changeAccountAction } from "../_actions/accounts";

type Submission = Parameters<typeof changeAccountAction>[0];

export function AccountChangeForm({
  submission,
  account,
  stale,
}: {
  submission: Submission;
  account: AccountEdit;
  stale?: boolean;
}) {
  const hydrated = useHydrated();
  const [bound] = useState(submission);
  const [draft, setDraft] = useState(account);
  const [error, submit, pending] = useActionState(
    changeAccountAction.bind(null, bound),
    null,
  );
  const closing = !!bound.closeKey;
  const outcome = error ?? (stale ? ACCOUNT_STALE : null);
  const field = (name: keyof AccountEdit) => ({
    id: `edit-${name}`,
    name,
    value: draft[name],
    onChange: (
      e: React.ChangeEvent<
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      >,
    ) => setDraft({ ...draft, [name]: e.target.value }),
  });
  return (
    <form
      action={submit}
      data-enhanced={hydrated || undefined}
      aria-label={closing ? "Cerrar cuenta" : "Editar cuenta"}
    >
      <input type="hidden" name="nativePost" value={hydrated ? "no" : "yes"} />
      {outcome && (
        <p className="outcome outcome-error" role="alert">
          {outcome}
        </p>
      )}
      {closing ? (
        <div className="field field-inline">
          <input
            id="confirm-close"
            name="confirm"
            type="checkbox"
            value="yes"
            required
          />
          <label htmlFor="confirm-close">
            Confirmo el cierre de esta cuenta
          </label>
        </div>
      ) : (
        <>
          {ACCOUNT_TEXT.map(([name, label, maxLength]) => (
            <div className="field" key={name}>
              <label htmlFor={`edit-${name}`}>{label}</label>
              {name === "description" ? (
                <textarea {...field(name)} maxLength={maxLength} />
              ) : (
                <input
                  {...field(name)}
                  maxLength={maxLength}
                  required={name === "name"}
                />
              )}
            </div>
          ))}
          <div className="field">
            <label htmlFor="edit-status">Estado</label>
            <select {...field("status")}>
              <option value="active">{ACCOUNT_STATUSES.active}</option>
              <option value="archived">{ACCOUNT_STATUSES.archived}</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="edit-includeInNetWorth">
              Incluir en el patrimonio
            </label>
            <select {...field("includeInNetWorth")}>
              <option value="true">Sí</option>
              <option value="false">No</option>
            </select>
          </div>
        </>
      )}
      <button className="submit" type="submit" disabled={pending}>
        {pending ? "Guardando…" : closing ? "Cerrar cuenta" : "Guardar cambios"}
      </button>
    </form>
  );
}
