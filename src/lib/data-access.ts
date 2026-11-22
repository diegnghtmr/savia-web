import "server-only";

import { redirect } from "next/navigation";
import { insightsTransport, record } from "./insights-gateway";
import { requireProfile } from "./require-profile";
import { ledgerScope } from "./transactions-gateway";
import { readWorkspaceContext } from "./workspace-context";
import { WORKSPACE_ID } from "./workspace-gateway";

export function dataId(value: unknown) {
  return typeof value === "string" && WORKSPACE_ID.test(value)
    ? value.toLowerCase()
    : null;
}

export async function dataAccess() {
  const profile = await requireProfile();
  if (profile.kind !== "ready") return null;
  const scope = await readWorkspaceContext(profile.accessToken);
  if (scope.kind === "unauthenticated") redirect("/sign-in");
  if (scope.kind !== "ok" || !scope.active) return null;
  return {
    ...profile,
    workspace: scope.active,
    request: insightsTransport(profile.accessToken, scope.active),
  };
}

export async function dataAccounts(
  access: NonNullable<Awaited<ReturnType<typeof dataAccess>>>,
) {
  const ledger = await ledgerScope(access.accessToken);
  if (ledger?.workspaceId !== access.workspace.id) return [];
  const accounts = await ledger.activeAccounts();
  return Object.entries(accounts?.currencies ?? {}).map(([id, currency]) => ({
    id,
    currency,
    name: accounts?.names.get(id) ?? id,
  }));
}

export async function dataObject(response: Response | null) {
  return record(await response?.json().catch(() => null));
}
