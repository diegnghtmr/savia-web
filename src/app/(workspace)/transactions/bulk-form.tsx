"use client";

import { useState, type ReactNode } from "react";
import { saveCapability } from "@/app/_actions/capabilities";
import { CapabilityForm } from "@/app/_components/capability-form";
import { useHydrated } from "@/lib/use-hydrated";

const actions = {
  categorize: "Categorizar",
  tag: "Añadir etiquetas",
  confirm: "Confirmar transacciones",
  archive: "Archivar",
  unarchive: "Desarchivar",
  setPayee: "Cambiar beneficiario",
  excludeFromReports: "Excluir de informes",
  includeInReports: "Incluir en informes",
  convertImported: "Convertir ajustes importados",
  setExtraordinary: "Cambiar clasificación extraordinaria",
};
const types = new Map([
  ["income", "Ingreso"],
  ["expense", "Gasto"],
]);
const flags = new Map([
  ["true", "Sí"],
  ["false", "No"],
]);

export function BulkForm({
  children,
  binding,
  names,
  categories,
  payees,
  tags,
}: {
  children: ReactNode;
  binding: { userId: string; workspaceId: string };
  names: Map<string, string>;
  categories: Map<string, string>;
  payees: Map<string, string>;
  tags: Map<string, string>;
}) {
  const [type, setType] = useState("");
  const [preview, setPreview] = useState<[string, string][]>();
  const [error, setError] = useState(false);
  const hydrated = useHydrated();
  const labels = new Map(Object.entries(actions));
  const extra =
    type === "categorize"
      ? (["categoryId", "Categoría del lote", categories] as const)
      : type === "setPayee"
        ? (["payeeId", "Beneficiario del lote", payees] as const)
        : type === "tag"
          ? (["tagIds", "Etiquetas del lote", tags] as const)
          : type === "convertImported"
            ? (["targetType", "Convertir a", types] as const)
            : type === "setExtraordinary"
              ? ([
                  "extraordinary",
                  "Clasificación extraordinaria",
                  flags,
                ] as const)
              : undefined;
  return (
    <section aria-label="Acciones en lote">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          if (!data.getAll("target").length) return setError(true);
          setError(false);
          setPreview(Array.from(data, ([key, value]) => [key, String(value)]));
        }}
        onChange={() => setPreview(undefined)}
      >
        {children}
        <label className="field">
          Acción en lote
          <select
            name="action"
            value={type}
            onChange={(event) => setType(event.target.value)}
            required
          >
            <option value="">Selecciona una acción</option>
            {[...labels].map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        {extra && (
          <label className="field" key={extra[0]}>
            {extra[1]}
            <select
              name={extra[0]}
              multiple={type === "tag"}
              required={type !== "categorize" && type !== "setPayee"}
            >
              {type !== "tag" && (
                <option value="">
                  {type === "categorize" || type === "setPayee"
                    ? "Quitar asignación"
                    : "Selecciona una opción"}
                </option>
              )}
              {[...extra[2]].map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        )}
        {error && <p role="alert">Selecciona al menos una transacción.</p>}
        <button className="submit" type="submit" disabled={!hydrated}>
          Vista previa del lote
        </button>
      </form>
      {preview && (
        <section aria-label="Vista previa del lote">
          <h2>Vista previa del lote</h2>
          <p>{labels.get(type)}</p>
          {extra && (
            <p>
              {extra[1]}:{" "}
              {preview
                .filter(([key]) => key === extra[0])
                .map(([, id]) => extra[2].get(id) ?? "Quitar asignación")
                .join(", ")}
            </p>
          )}
          <ul>
            {preview
              .filter(([key]) => key === "target")
              .map(([, id]) => (
                <li key={id}>{names.get(id)}</li>
              ))}
          </ul>
          <p>
            La acción se aplica a todas las transacciones seleccionadas o a
            ninguna.
          </p>
          <CapabilityForm
            label="Aplicar acción en lote"
            action={saveCapability.bind(null, {
              ...binding,
              kind: "bulk-transactions",
            })}
          >
            {preview.map(([key, value]) => (
              <input
                key={`${key}:${value}`}
                type="hidden"
                name={key}
                value={value}
              />
            ))}
            <label className="field">
              Confirmo la acción en lote
              <input type="checkbox" name="confirmed" value="yes" required />
            </label>
          </CapabilityForm>
        </section>
      )}
    </section>
  );
}
