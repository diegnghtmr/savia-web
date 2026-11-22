"use client";

import { useState } from "react";
import { unavailableDraft, useDraftAction } from "@/lib/draft-client";
import {
  saveTransactionAction,
  type TransactionSubmission,
} from "../_actions/transactions";
import { DraftSubmit } from "./draft-submit";

type Options = [string, string][];
type Labels = Record<
  "accounts" | "categories" | "payees" | "tags",
  Map<string, string>
>;
type Initial = {
  occurredAt: string;
  categoryId?: string;
  payeeId?: string;
  description?: string;
  tagIds: string[];
};
export function TransactionForm({
  submission,
  labels,
  row,
  types,
}: {
  submission: TransactionSubmission;
  labels?: Labels;
  row?: Initial;
  types?: Record<string, string>;
}) {
  const [bound] = useState(submission);
  const [values, setValues] = useState<Record<string, string>>({
    date: row ? new Date(row.occurredAt).toISOString().slice(0, 10) : "",
    categoryId: row?.categoryId ?? "",
    payeeId: row?.payeeId ?? "",
    description: row?.description ?? "",
  });
  const [tags, setTags] = useState(row?.tagIds ?? []);
  const [state, submit, pending] = useDraftAction(
    "transaction",
    bound,
    saveTransactionAction.bind(null, bound),
    unavailableDraft,
  );
  const error = typeof state === "string" ? state : state?.error;
  const confirmation =
    typeof state === "object" ? state?.confirmation : undefined;
  const mode = bound.mode;
  const title =
    mode === "create"
      ? "Crear transacción"
      : mode === "edit"
        ? "Guardar cambios"
        : "Anular transacción";
  const field = (name: string) => ({
    id: `${mode}-${name}`,
    name,
    value: values[name] ?? "",
    onChange: (
      event: React.ChangeEvent<
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      >,
    ) => setValues({ ...values, [name]: event.target.value }),
  });
  function select(
    name: string,
    label: string,
    options: Options,
    required = false,
  ) {
    return (
      <div className="field">
        <label htmlFor={`${mode}-${name}`}>{label}</label>
        <select {...field(name)} required={required}>
          <option value="">
            {required ? "Selecciona una opción" : "Sin asignar"}
          </option>
          {values[name] && !options.some(([id]) => id === values[name]) && (
            <option value={values[name]}>No disponible</option>
          )}
          {options.map(([id, title]) => (
            <option key={id} value={id}>
              {title}
            </option>
          ))}
        </select>
      </div>
    );
  }
  return (
    <form
      action={submit}
      aria-label={title}
      onReset={(event) => event.preventDefault()}
    >
      {error && (
        <p className="outcome outcome-error" role="alert">
          {error}
        </p>
      )}
      {mode === "void" ? (
        <>
          <div className="field">
            <label htmlFor="void-reason">Motivo de anulación</label>
            <input
              {...field("reason")}
              minLength={3}
              maxLength={500}
              required
            />
          </div>
          <div className="field field-inline">
            <input
              id="confirm-void"
              name="confirm"
              type="checkbox"
              value="yes"
              checked={values.confirm === "yes"}
              onChange={(event) =>
                setValues({
                  ...values,
                  confirm: event.target.checked ? "yes" : "",
                })
              }
              required
            />
            <label htmlFor="confirm-void">Confirmo la anulación</label>
          </div>
        </>
      ) : (
        labels && (
          <>
            {mode === "create" && (
              <>
                {select("type", "Tipo", Object.entries(types ?? {}), true)}
                {select(
                  "accountId",
                  "Cuenta",
                  Object.entries(bound.currencies).map(([id, currency]) => [
                    id,
                    `${labels.accounts.get(id)} (${currency})`,
                  ]),
                  true,
                )}
                <div className="field">
                  <label htmlFor="create-amount">Importe</label>
                  <input
                    {...field("amount")}
                    inputMode="decimal"
                    aria-describedby="transaction-amount-hint"
                    required
                  />
                  <p className="hint" id="transaction-amount-hint">
                    Usa la moneda de la cuenta, sin separadores de miles.
                  </p>
                </div>
              </>
            )}
            <div className="field">
              <label htmlFor={`${mode}-date`}>Fecha (UTC)</label>
              <input {...field("date")} type="date" required />
            </div>
            {select("categoryId", "Categoría", Array.from(labels.categories))}
            {select("payeeId", "Beneficiario", Array.from(labels.payees))}
            <div className="field">
              <label htmlFor={`${mode}-tags`}>Etiquetas</label>
              <select
                id={`${mode}-tags`}
                name="tagIds"
                multiple
                value={tags}
                onChange={(event) =>
                  setTags(
                    Array.from(
                      event.target.selectedOptions,
                      ({ value }) => value,
                    ),
                  )
                }
              >
                {Array.from(new Set([...labels.tags.keys(), ...tags]), (id) => (
                  <option key={id} value={id}>
                    {labels.tags.get(id) ?? "No disponible"}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor={`${mode}-description`}>Descripción</label>
              <textarea {...field("description")} maxLength={500} />
            </div>
          </>
        )
      )}
      <DraftSubmit
        workspaceId={bound.workspaceId}
        label={pending ? "Guardando…" : title}
        pending={pending}
        confirmation={confirmation}
      />
    </form>
  );
}
