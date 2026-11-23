import { saveCapability } from "@/app/_actions/capabilities";
import { CapabilityForm } from "@/app/_components/capability-form";
import { versionTag } from "@/lib/capability-input";
import { listFilters, nextPage, titled } from "@/lib/capability-lists";
import { dataAccess, dataObject } from "@/lib/data-access";
import { insightsTransport, record } from "@/lib/insights-gateway";
import { parsePage } from "@/lib/transactions-gateway";
import type { SearchParams } from "@/lib/view-filters";

export const dynamic = "force-dynamic";
const channels = {
  in_app: "En Savia",
  push: "Notificaciones push",
  email: "Correo",
};

function notification(item: unknown) {
  const top = titled(item);
  const row = record(item);
  if (!top || typeof row?.read !== "boolean") return null;
  const body = typeof row.body === "string" ? row.body : null;
  return { ...top, read: row.read, body };
}

function preferences(value: Record<string, unknown> | null) {
  const saved = record(value?.channels);
  const quiet = record(value?.quietHours);
  const fields = ["start", "end", "timezone"] as const;
  if (
    !value ||
    !saved ||
    typeof value.digestEnabled !== "boolean" ||
    Object.keys(channels).some((name) => typeof saved[name] !== "boolean") ||
    (value.quietHours !== null &&
      (!quiet || fields.some((name) => typeof quiet[name] !== "string")))
  )
    return null;
  return { saved, digest: value.digestEnabled, quiet };
}

export default async function Notifications({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const filters = listFilters(await searchParams, {
    unreadOnly: (value) => value === "true" || value === "false",
  });
  if (!filters) return <p role="alert">Revisa los filtros.</p>;
  const access = await dataAccess();
  if (!access) return <p role="alert">No hay un espacio activo disponible.</p>;
  const request = insightsTransport(access.accessToken);
  const [inbox, settings] = await Promise.all([
    request("notifications", filters),
    request("me/notification-preferences"),
  ]);
  const rows =
    inbox?.status === 200
      ? parsePage(await dataObject(inbox), notification)
      : null;
  const prefs =
    settings?.status === 200 ? preferences(await dataObject(settings)) : null;
  const tag = settings?.headers.get("etag");
  const version = versionTag(tag) ? tag : undefined;
  const scope = { userId: access.userId, workspaceId: access.workspace.id };
  const more = nextPage("/notifications", filters, rows?.cursor);
  const unread = filters.get("unreadOnly") === "true";
  const toggle = unread ? "/notifications" : "/notifications?unreadOnly=true";
  const save = saveCapability.bind(null, {
    ...scope,
    version,
    kind: "notification-preferences",
  });
  return (
    <>
      <h1>Notificaciones</h1>
      <p>Alertas de presupuesto: 80 % y 100 %.</p>
      <a href={toggle}>{unread ? "Ver todas" : "Ver solo no leídas"}</a>
      {!rows ? (
        <p role="alert">No pudimos cargar las notificaciones.</p>
      ) : !rows.items.length ? (
        <p>No hay notificaciones.</p>
      ) : (
        <ul>
          {rows.items.map(({ id, title, body, read }) => (
            <li key={id}>
              <h2>{title}</h2>
              <p>{read ? "Leída" : "No leída"}</p>
              {body && <p>{body}</p>}
              {!read && (
                <CapabilityForm
                  label="Marcar como leída"
                  action={saveCapability.bind(null, {
                    ...scope,
                    id,
                    kind: "notification-read",
                  })}
                />
              )}
            </li>
          ))}
        </ul>
      )}
      {more && <a href={more}>Siguiente</a>}
      <h2>Preferencias</h2>
      {!prefs ? (
        <p role="alert">No pudimos cargar tus preferencias.</p>
      ) : (
        <CapabilityForm label="Guardar preferencias" action={save}>
          {Object.entries(channels).map(([id, label]) => (
            <label className="field" key={id}>
              <input
                name={id}
                type="checkbox"
                value="yes"
                defaultChecked={prefs.saved[id] === true}
              />
              {label}
            </label>
          ))}
          <label className="field">
            <input
              name="digest"
              type="checkbox"
              value="yes"
              defaultChecked={prefs.digest}
            />
            Resumen de los lunes
          </label>
          <p>Para desactivar el horario silencioso, borra ambas horas.</p>
          <label className="field">
            Inicio del horario silencioso
            <input
              name="start"
              type="time"
              defaultValue={String(prefs.quiet?.start ?? "")}
            />
          </label>
          <label className="field">
            Fin del horario silencioso
            <input
              name="end"
              type="time"
              defaultValue={String(prefs.quiet?.end ?? "")}
            />
          </label>
          <label className="field">
            Zona horaria
            <input
              name="timezone"
              defaultValue={String(prefs.quiet?.timezone ?? "UTC")}
              maxLength={80}
            />
          </label>
        </CapabilityForm>
      )}
    </>
  );
}
