"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { unavailableDraft, useDraftAction } from "@/lib/draft-client";
import {
  saveAllocations,
  saveBudget,
  type Binding,
  type BudgetResult,
} from "../_actions/budgets";
import { DraftReceipt } from "./draft-receipt";
import { DraftSubmit } from "./draft-submit";

type Choices = [string, string][];
type Row = {
  categoryId: string;
  planned: string;
  policy: string;
  target: string;
};

function BudgetForm({
  action,
  label,
  bound,
  kind,
  children,
}: {
  bound: Binding;
  kind: "budget" | "allocations";
  action: (state: BudgetResult, data: FormData) => Promise<BudgetResult>;
  label: string;
  children: ReactNode;
}) {
  const [state, submit, pending] = useDraftAction(kind, bound, action, {
    error: unavailableDraft,
  });
  if (state && "receipt" in state)
    return (
      <>
        <p role="status">Cambios guardados.</p>
        <DraftReceipt id={state.receipt} />
        <Link href={`/budgets/${state.id}`} prefetch={false}>
          Ver presupuesto
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
        {children}
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

export function BudgetMetadata({
  bound,
  methods,
  name = "",
  method = "cash_flow",
  period,
  copy,
}: {
  bound: Binding;
  methods: Choices;
  name?: string;
  method?: string;
  period?: [string, string];
  copy?: { id: string; name: string };
}) {
  return (
    <BudgetForm
      bound={bound}
      kind="budget"
      action={saveBudget.bind(null, bound)}
      label={period ? "Crear presupuesto" : "Guardar presupuesto"}
    >
      <div className="field">
        <label>
          Nombre{" "}
          <input name="name" required maxLength={120} defaultValue={name} />
        </label>
      </div>
      <div className="field">
        <label>
          Método{" "}
          <select name="method" defaultValue={method}>
            {methods.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {period && (
        <>
          <div className="field">
            <label>
              Inicio del periodo{" "}
              <input
                name="periodStart"
                type="date"
                required
                defaultValue={period[0]}
              />
            </label>
          </div>
          <div className="field">
            <label>
              Fin del periodo{" "}
              <input
                name="periodEnd"
                type="date"
                required
                defaultValue={period[1]}
              />
            </label>
          </div>
        </>
      )}
      {copy && (
        <>
          <p>Copiar asignaciones de: {copy.name}</p>
          <input type="hidden" name="copyFromBudgetId" value={copy.id} />
        </>
      )}
    </BudgetForm>
  );
}

export function BudgetAllocations({
  bound,
  initial,
  categories,
  policies,
}: {
  bound: Binding;
  initial: Row[];
  categories: Choices;
  policies: Choices;
}) {
  const [rows, setRows] = useState(() =>
    initial.map((row, key) => ({ ...row, key })),
  );
  const [nextKey, setNextKey] = useState(initial.length);
  const update = (key: number, patch: Partial<Row>) =>
    setRows(rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  return (
    <BudgetForm
      bound={bound}
      kind="allocations"
      action={saveAllocations.bind(null, bound)}
      label="Guardar asignaciones"
    >
      <p>Se guardarán solo las categorías de esta lista.</p>
      {rows.map((row, index) => (
        <fieldset key={row.key}>
          <legend>Asignación {index + 1}</legend>
          <div className="field">
            <label>
              Categoría{" "}
              <select
                name="categoryId"
                required
                value={row.categoryId}
                onChange={(event) =>
                  update(row.key, { categoryId: event.target.value })
                }
              >
                <option value="">Elige una categoría</option>
                {row.categoryId &&
                  !categories.some(([id]) => id === row.categoryId) && (
                    <option value={row.categoryId}>{row.categoryId}</option>
                  )}
                {categories.map(([id, name]) => (
                  <option
                    key={id}
                    value={id}
                    disabled={rows.some(
                      (other) =>
                        other.key !== row.key && other.categoryId === id,
                    )}
                  >
                    {name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="field">
            <label>
              Importe planeado ({bound.currency}){" "}
              <input
                name="planned"
                inputMode="decimal"
                required
                defaultValue={row.planned}
              />
            </label>
          </div>
          <div className="field">
            <label>
              Arrastre{" "}
              <select
                name="rolloverPolicy"
                value={row.policy}
                onChange={(event) =>
                  update(row.key, { policy: event.target.value })
                }
              >
                {policies.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {row.policy === "to_category" ? (
            <div className="field">
              <label>
                Categoría de destino{" "}
                <select
                  name="rolloverTargetId"
                  required
                  defaultValue={row.target}
                >
                  <option value="">Elige una categoría</option>
                  {row.target &&
                    !categories.some(([id]) => id === row.target) && (
                      <option value={row.target}>{row.target}</option>
                    )}
                  {categories.map(([id, name]) => (
                    <option key={id} value={id}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : (
            <input type="hidden" name="rolloverTargetId" value="" />
          )}
          <button
            type="button"
            onClick={() => setRows(rows.filter(({ key }) => row.key !== key))}
          >
            Quitar asignación {index + 1}
          </button>
        </fieldset>
      ))}
      <button
        type="button"
        disabled={rows.length >= Math.min(categories.length, 1000)}
        onClick={() => {
          setRows([
            ...rows,
            {
              key: nextKey,
              categoryId: "",
              planned: "",
              policy: "none",
              target: "",
            },
          ]);
          setNextKey(nextKey + 1);
        }}
      >
        Añadir categoría
      </button>
    </BudgetForm>
  );
}
