export const workspaceRoles = [
  "owner",
  "administrator",
  "editor",
  "viewer",
] as const;
export type WorkspaceRole = (typeof workspaceRoles)[number];

export function workspaceRole(value: unknown): value is WorkspaceRole {
  return workspaceRoles.some((role) => role === value);
}

export function canManageMembers(role: WorkspaceRole | undefined) {
  return role === "owner" || role === "administrator";
}

export function canWriteWorkspace(role: WorkspaceRole | undefined) {
  return canManageMembers(role) || role === "editor";
}

export const roleNames: Record<WorkspaceRole, string> = {
  owner: "Propietario",
  administrator: "Administrador",
  editor: "Editor",
  viewer: "Lector",
};
