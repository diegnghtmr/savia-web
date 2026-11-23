import Link from "next/link";
import { saveCapability } from "@/app/_actions/capabilities";
import { CapabilityForm } from "@/app/_components/capability-form";
import { CapabilityReceipt } from "@/app/_components/capability-receipt";
import {
  cardLabels,
  presetLabels,
  readPreferences,
} from "@/lib/dashboard-preferences";
import { dataAccess } from "@/lib/data-access";
import type { SearchParams } from "@/lib/view-filters";

export const metadata = { title: "Personalizar vista general" };
export const dynamic = "force-dynamic";

export default async function DashboardPreferences({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { conflicto, guardado } = await searchParams;
  const access = await dataAccess();
  if (!access) return <p role="alert">No hay un espacio activo disponible.</p>;
  const { userId, workspace, accessToken } = access;
  const binding = { workspaceId: workspace.id, userId };
  const prefs = await readPreferences(
    accessToken,
    workspace,
    AbortSignal.timeout(5000),
  );
  return (
    <>
      <Link href="/overview">Volver a la vista general</Link>
      <p className="eyebrow">{workspace.name}</p>
      <h1>Personalizar vista general</h1>
      {conflicto === "1" && (
        <p role="alert">
          Las preferencias cambiaron. Revisa los datos actualizados.
        </p>
      )}
      {guardado && <CapabilityReceipt requested={guardado} {...binding} />}
      {prefs === "unavailable" ? (
        <p role="alert">
          Las preferencias de la vista general no están disponibles.
        </p>
      ) : !prefs ? (
        <p role="alert">
          No pudimos cargar las preferencias de la vista general.
        </p>
      ) : (
        <CapabilityForm
          key={`${workspace.id}:${prefs.version}`}
          label="Guardar preferencias"
          action={saveCapability.bind(null, {
            ...binding,
            kind: "dashboard-preferences",
            version: prefs.version,
          })}
        >
          <fieldset>
            <legend>Orden y visibilidad de las tarjetas</legend>
            <p>
              Usa posiciones distintas del 1 al 11. Deja la posición vacía para
              omitir una tarjeta no visible.
            </p>
            {Object.entries(cardLabels).map(([id, label]) => {
              const index = prefs.cards.findIndex((card) => card.id === id);
              return (
                <fieldset key={id}>
                  <legend>{label}</legend>
                  <label className="field" aria-label={`Posición: ${label}`}>
                    Posición
                    <input
                      name={`order_${id}`}
                      type="number"
                      min={1}
                      max={11}
                      defaultValue={index < 0 ? undefined : index + 1}
                    />
                  </label>
                  <label className="field field-inline">
                    <input
                      name={`visible_${id}`}
                      value="yes"
                      type="checkbox"
                      defaultChecked={prefs.cards[index]?.visible}
                    />
                    Mostrar {label.toLocaleLowerCase("es")}
                  </label>
                </fieldset>
              );
            })}
          </fieldset>
          <label className="field">
            Período predeterminado
            <select name="preset" defaultValue={prefs.period.preset}>
              {Object.entries(presetLabels).map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Desde (período personalizado)
            <input
              name="from"
              type="date"
              defaultValue={
                "from" in prefs.period ? prefs.period.from : undefined
              }
            />
          </label>
          <label className="field">
            Hasta (período personalizado)
            <input
              name="to"
              type="date"
              defaultValue={"to" in prefs.period ? prefs.period.to : undefined}
            />
          </label>
          <label className="field">
            Moneda de presentación (código de tres letras)
            <input
              name="presentationCurrency"
              pattern="[A-Z]{3}"
              maxLength={3}
              required
              defaultValue={prefs.presentationCurrency}
            />
          </label>
        </CapabilityForm>
      )}
    </>
  );
}
