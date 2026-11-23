import { saveCapability } from "@/app/_actions/capabilities";
import { CapabilityForm } from "@/app/_components/capability-form";
import { providerId } from "@/lib/capability-input";
import { dataAccess, dataId } from "@/lib/data-access";
import { record } from "@/lib/insights-gateway";
import type { SearchParams } from "@/lib/view-filters";

export const dynamic = "force-dynamic";

async function items(response: Response | null) {
  if (response?.status !== 200) return null;
  const value: unknown = await response.json().catch(() => null);
  return Array.isArray(value) ? (value as unknown[]) : null;
}

function provider(value: unknown) {
  const row = record(value);
  return providerId(row?.providerId) &&
    row.enabled === true &&
    Array.isArray(row.credentialTypes) &&
    row.credentialTypes.includes("api_key")
    ? [row.providerId]
    : [];
}

function credential(value: unknown, user: string) {
  const row = record(value);
  const id = dataId(row?.id);
  if (
    !id ||
    !row ||
    !providerId(row.providerId) ||
    row.ownerType !== "user" ||
    dataId(row.ownerSubjectId) !== user ||
    row.credentialType !== "api_key" ||
    row.status === "revoked"
  )
    return [];
  const raw = row.maskedIdentifier;
  const maskPattern = /^[•*]{4}[A-Za-z0-9_-]{0,4}$/;
  const safe = typeof raw === "string" && maskPattern.test(raw);
  const { version } = row;
  const valid = typeof version === "number" && Number.isInteger(version);
  const tag = valid && version >= 0 ? `"${BigInt(version)}"` : undefined;
  return [
    {
      id,
      provider: row.providerId,
      mask: safe ? raw : "••••",
      version: tag,
    },
  ];
}

function Secret({ label }: { label: string }) {
  return (
    <label className="field">
      {label}
      <input
        name="secret"
        type="password"
        autoComplete="off"
        maxLength={8192}
        required
      />
    </label>
  );
}

export default async function Credentials({
  searchParams,
}: { searchParams?: Promise<SearchParams> } = {}) {
  const refreshed = (await searchParams)?.actualizada === "1";
  const access = await dataAccess();
  if (!access) return <p role="alert">No hay un espacio activo disponible.</p>;
  const [providers, keys] = await Promise.all([
    access.request("ai/providers").then(items),
    access.request("ai/credentials").then(items),
  ]);
  const scope = { userId: access.userId, workspaceId: access.workspace.id };
  const choices = [...new Set(providers?.flatMap(provider))];
  const credentials = keys?.flatMap((item) => credential(item, scope.userId));
  const add = saveCapability.bind(null, { ...scope, kind: "credential-add" });
  return (
    <>
      <h1>Claves de IA</h1>
      <p className="eyebrow">{access.workspace.name}</p>
      {refreshed && (
        <p role="alert">
          La clave cambió o hubo un conflicto. Revisa los datos actualizados.
        </p>
      )}
      <h2>Agregar clave personal</h2>
      {!choices.length ? (
        <p role="alert">No hay proveedores de claves disponibles.</p>
      ) : (
        <CapabilityForm secret label="Agregar clave" action={add}>
          <label className="field">
            Proveedor
            <select name="provider" required>
              {choices.map((id) => (
                <option key={id}>{id}</option>
              ))}
            </select>
          </label>
          <Secret label="Clave del proveedor" />
        </CapabilityForm>
      )}
      <h2>Claves personales guardadas</h2>
      {!credentials ? (
        <p role="alert">No pudimos cargar las claves.</p>
      ) : !credentials.length ? (
        <p>No hay claves guardadas.</p>
      ) : (
        <ul>
          {credentials.map(({ id, provider, mask, version }) => (
            <li key={id}>
              <h3>
                {provider} · {mask}
              </h3>
              {version ? (
                <CapabilityForm
                  secret
                  label="Reemplazar clave"
                  action={saveCapability.bind(null, {
                    ...scope,
                    id,
                    version,
                    kind: "credential-replace",
                  })}
                >
                  <Secret label="Nueva clave" />
                </CapabilityForm>
              ) : (
                <p>Reemplazo no disponible.</p>
              )}
              <CapabilityForm
                label="Quitar clave"
                action={saveCapability.bind(null, {
                  ...scope,
                  id,
                  kind: "credential-remove",
                })}
              />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
