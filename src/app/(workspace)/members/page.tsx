import { saveCapability } from "@/app/_actions/capabilities";
import { CapabilityForm } from "@/app/_components/capability-form";
import { CapabilityReceipt } from "@/app/_components/capability-receipt";
import { listFilters, nextPage } from "@/lib/capability-lists";
import { dataAccess, dataId, dataObject } from "@/lib/data-access";
import { insightsTransport, record } from "@/lib/insights-gateway";
import { parsePage } from "@/lib/transactions-gateway";
import type { SearchParams } from "@/lib/view-filters";
import {
  canManageMembers,
  roleNames,
  workspaceRole,
  workspaceRoles,
  type WorkspaceRole,
} from "@/lib/workspace-roles";

export const dynamic = "force-dynamic";

type Binding = { userId: string; workspaceId: string };

function rosterRow(value: unknown) {
  const row = record(value);
  const id = dataId(row?.id);
  if (!row || !id || !workspaceRole(row.role) || typeof row.status !== "string")
    return null;
  const email = typeof row.email === "string" ? row.email : undefined;
  return {
    id,
    role: row.role,
    status: row.status,
    email,
    name: typeof row.displayName === "string" ? row.displayName : email,
  };
}

export default async function Members({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { tab, guardado, ...input } = await searchParams;
  const filters = listFilters(input);
  if (!filters || (tab !== undefined && tab !== "invitations"))
    return <p role="alert">Revisa los filtros de miembros.</p>;
  const access = await dataAccess();
  if (!access) return <p role="alert">No hay un espacio activo disponible.</p>;
  const { workspace, userId } = access;
  const binding = { workspaceId: workspace.id, userId };
  const manages = canManageMembers(workspace.role);
  const kind = workspace.kind;
  const collaborative = kind === "family" || kind === "shared";
  const canEdit = manages && collaborative;
  const invitations = tab === "invitations";
  if (invitations && !canEdit)
    return (
      <p role="alert">No puedes consultar las invitaciones de este espacio.</p>
    );
  const resource = invitations ? "invitations" : "members";
  const response = await insightsTransport(access.accessToken)(
    `workspaces/${workspace.id}/${resource}`,
    filters,
  );
  const rows =
    response?.status === 200
      ? parsePage(await dataObject(response), rosterRow)
      : null;
  if (invitations) filters.set("tab", tab);
  const more = nextPage("/members", filters, rows?.cursor);
  const roles = workspaceRoles.filter(
    (role) => role !== "owner" || workspace.role === "owner",
  );
  const invite = saveCapability.bind(null, {
    ...binding,
    kind: "member-invite",
  });
  return (
    <>
      <h1>{invitations ? "Invitaciones" : "Miembros del espacio"}</h1>
      <p>{workspace.name}</p>
      <CapabilityReceipt requested={guardado} {...binding} />
      {canEdit && (
        <a href={invitations ? "/members" : "/members?tab=invitations"}>
          {invitations ? "Ver miembros" : "Ver invitaciones"}
        </a>
      )}
      {rows ? (
        rows.items.length ? (
          <ul>
            {rows.items.map((item) => (
              <li key={item.id}>
                <h2>{item.name ?? "Nombre no informado"}</h2>
                <p>
                  {roleNames[item.role]} · {item.status}
                </p>
                {!invitations && manages && item.email && <p>{item.email}</p>}
                {!invitations && canEdit && roles.includes(item.role) && (
                  <MemberControls binding={binding} item={item} roles={roles} />
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p>No hay resultados en esta página.</p>
        )
      ) : (
        <p role="alert">No pudimos cargar la lista.</p>
      )}
      {more && <a href={more}>Siguiente</a>}
      {canEdit && (
        <CapabilityForm label="Invitar miembro" action={invite}>
          <label className="field">
            Correo de invitación
            <input name="email" type="email" required maxLength={320} />
          </label>
          <RoleField roles={roles} current="viewer" />
        </CapabilityForm>
      )}
    </>
  );
}

function MemberControls({
  binding,
  item,
  roles,
}: {
  binding: Binding;
  item: NonNullable<ReturnType<typeof rosterRow>>;
  roles: WorkspaceRole[];
}) {
  const target = { ...binding, id: item.id };
  const change = saveCapability.bind(null, { ...target, kind: "member-role" });
  const remove = saveCapability.bind(null, {
    ...target,
    kind: "member-remove",
  });
  return (
    <>
      <CapabilityForm label="Cambiar rol" action={change}>
        <RoleField roles={roles} current={item.role} />
      </CapabilityForm>
      <CapabilityForm label="Eliminar miembro" action={remove}>
        <label className="field">
          Confirmo la eliminación
          <input type="checkbox" name="remove" value="yes" required />
        </label>
      </CapabilityForm>
    </>
  );
}

function RoleField({
  roles,
  current,
}: {
  roles: WorkspaceRole[];
  current: WorkspaceRole;
}) {
  return (
    <label className="field">
      Rol
      <select name="role" defaultValue={current} required>
        {roles.map((role) => (
          <option key={role} value={role}>
            {roleNames[role]}
          </option>
        ))}
      </select>
    </label>
  );
}
