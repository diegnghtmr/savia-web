import { saveCapability } from "@/app/_actions/capabilities";
import { CapabilityForm } from "@/app/_components/capability-form";
import { CapabilityReceipt } from "@/app/_components/capability-receipt";
import { money } from "@/lib/account-money";
import { listFilters, nextPage } from "@/lib/capability-lists";
import { dataAccess, dataObject } from "@/lib/data-access";
import { insightsTransport } from "@/lib/insights-gateway";
import { grantSummary, scopes } from "@/lib/mcp-grants";
import { parsePage } from "@/lib/transactions-gateway";
import type { SearchParams } from "@/lib/view-filters";

export const dynamic = "force-dynamic";

export default async function McpGrants({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { guardado, ...input } = await searchParams;
  const filters = listFilters(input);
  if (!filters) return <p role="alert">Revisa los filtros de permisos.</p>;
  const access = await dataAccess();
  if (!access) return <p role="alert">No hay un espacio activo disponible.</p>;
  const { workspace, userId } = access;
  const response = await insightsTransport(access.accessToken)(
    "mcp/grants",
    filters,
  );
  const grants =
    response?.status === 200
      ? parsePage(await dataObject(response), grantSummary)
      : null;
  const more = nextPage("/mcp-grants", filters, grants?.cursor);
  const binding = { userId, workspaceId: workspace.id };
  return (
    <>
      <h1>Permisos MCP</h1>
      <p>Los permisos nuevos se limitan a {workspace.name}.</p>
      <CapabilityReceipt requested={guardado} {...binding} />
      {!grants ? (
        <p role="alert">No pudimos cargar tus permisos MCP.</p>
      ) : !grants.items.length ? (
        <p>No hay permisos en esta página.</p>
      ) : (
        <ul>
          {grants.items.map((item) => (
            <li key={item.id}>
              <h2>{item.name}</h2>
              <p>Estado: {item.status}</p>
              <p>Alcances: {item.scopes.join(", ")}</p>
              {item.workspaceIds && <p>Espacios: {item.workspaceIds}</p>}
              <p>
                {"Límite por escritura: "}
                {item.cap ? money(item.cap) : "Sin límite configurado"}
              </p>
              {item.expires && <p>Caduca: {item.expires}</p>}
              <p>Ventanas semanales: {item.windows ?? "No informadas"}</p>
              <p>
                {"Herramientas autorizadas explícitamente: "}
                {item.explicitTools ?? "No informadas"}
              </p>
              {item.status === "active" && (
                <CapabilityForm
                  label={`Revocar ${item.name}`}
                  action={saveCapability.bind(null, {
                    ...binding,
                    kind: "grant-revoke",
                    id: item.id,
                  })}
                >
                  <label className="field">
                    Confirmo la revocación
                    <input type="checkbox" name="revoke" value="yes" required />
                  </label>
                </CapabilityForm>
              )}
            </li>
          ))}
        </ul>
      )}
      {more && <a href={more}>Siguiente</a>}
      <CapabilityForm
        label="Crear permiso MCP"
        action={saveCapability.bind(null, { ...binding, kind: "grant-create" })}
      >
        <label className="field">
          Nombre del cliente
          <input name="clientName" required maxLength={120} />
        </label>
        <fieldset>
          <legend>Alcances</legend>
          {scopes.map((scope) => (
            <label key={scope} className="field">
              {scope} <input type="checkbox" name="scope" value={scope} />
            </label>
          ))}
        </fieldset>
        <label className="field">
          Límite por escritura (opcional)
          <input name="cap" inputMode="decimal" />
        </label>
        <label className="field">
          Moneda del límite
          <input name="currency" pattern="[A-Za-z]{3}" placeholder="COP" />
        </label>
        <label className="field">
          Caducidad (UTC, opcional)
          <input name="expiresAt" type="datetime-local" />
        </label>
        <label className="field">
          IDs de cuentas permitidas (opcional)
          <textarea name="accounts" />
        </label>
        <label className="field">
          Herramientas (opcional; vacío solo permite lecturas)
          <textarea name="tools" placeholder="create_transaction" />
        </label>
        <label className="field">
          Ventanas semanales (una por línea; sin ventanas no hay acceso)
          <textarea name="schedule" placeholder="1 08:00 17:00" />
        </label>
        <p>Usa día (lunes = 1), inicio y fin, en la hora del espacio.</p>
      </CapabilityForm>
    </>
  );
}
