import Link from "next/link";
import {
  revokeAllSessionsAction,
  revokeOtherSessionsAction,
} from "@/app/_actions/auth";
import { dataId, dataObject } from "@/lib/data-access";
import { insightsTransport, record } from "@/lib/insights-gateway";
import { requireProfile } from "@/lib/require-profile";
import { parsePage } from "@/lib/transactions-gateway";
import { viewFilters, type SearchParams } from "@/lib/view-filters";

export const metadata = { title: "Sesiones activas" };
export const dynamic = "force-dynamic";
const notices = {
  otras: "Se cerraron las demás sesiones.",
  invalida: "Confirma la solicitud antes de continuar.",
  "no-disponible": "El cierre de las demás sesiones no está disponible.",
  error: "No pudimos completar el cierre de sesiones.",
};

export default async function Sessions({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { resultado, ...query } = await searchParams;
  const filters = viewFilters(query, {});
  if (!filters)
    return (
      <p role="alert">
        Revisa los filtros. <Link href="/sessions">Volver a sesiones</Link>
      </p>
    );
  const profile = await requireProfile();
  if (profile.kind !== "ready")
    return <p role="alert">No pudimos consultar tu perfil.</p>;
  const response = await insightsTransport(profile.accessToken)(
    "me/sessions",
    filters,
    { signal: AbortSignal.timeout(5000) },
  );
  const unavailable = response?.status === 404 || response?.status === 501;
  const page =
    response?.status === 200
      ? parsePage(await dataObject(response), sessionRow)
      : null;
  const notice =
    typeof resultado === "string" && Object.hasOwn(notices, resultado)
      ? notices[resultado as keyof typeof notices]
      : undefined;
  if (page?.cursor) filters.set("cursor", page.cursor);
  const controls = [
    ...(page
      ? [[revokeOtherSessionsAction, "Cerrar las demás sesiones"] as const]
      : []),
    [revokeAllSessionsAction, "Cerrar todas las sesiones"] as const,
  ];
  return (
    <>
      <Link href="/overview">Volver a la vista general</Link>
      <h1>Sesiones activas</h1>
      {notice && (
        <p role={resultado === "otras" ? "status" : "alert"}>{notice}</p>
      )}
      {!page ? (
        <p role="alert">
          {unavailable
            ? "La lista de sesiones no está disponible."
            : "No pudimos cargar las sesiones."}
        </p>
      ) : (
        <>
          <table>
            <caption>Sesiones de tu cuenta</caption>
            <thead>
              <tr>
                <th scope="col">Sesión</th>
                <th scope="col">Inicio (UTC)</th>
                <th scope="col">Última actividad (UTC)</th>
              </tr>
            </thead>
            <tbody>
              {page.items.map(({ id, current, started, active }) => (
                <tr key={id}>
                  <th scope="row">
                    {current ? "Sesión actual" : "Otra sesión"}
                  </th>
                  <td>
                    <time dateTime={started}>{started}</time>
                  </td>
                  <td>
                    <time dateTime={active}>{active}</time>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!page.items.length && <p>No hay sesiones en esta página.</p>}
          {page.cursor && <Link href={`/sessions?${filters}`}>Siguiente</Link>}
        </>
      )}
      {controls.map(([action, label]) => (
        <form
          key={label}
          aria-label={label}
          action={action.bind(null, profile.userId)}
        >
          <label className="field field-inline">
            <input type="checkbox" name="confirmar" value="yes" required />
            Confirmo: {label.toLocaleLowerCase("es")}
          </label>
          <button className="submit" type="submit">
            {label}
          </button>
        </form>
      ))}
    </>
  );
}

function sessionRow(input: unknown) {
  const row = record(input);
  const id = dataId(row?.id);
  const started = isoTime(row?.createdAt);
  const active = isoTime(row?.lastActiveAt);
  return id && typeof row?.current === "boolean" && started && active
    ? { id, current: row.current, started, active }
    : null;
}

function isoTime(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(value))
    return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}
