import "server-only";

import { cookies } from "next/headers";
import { listWorkspaces } from "./workspace-gateway";

const COOKIE = "savia-workspace";

/** Resolve a verified workspace id for later X-Workspace-Id requests. */
export async function readWorkspaceContext(accessToken: string) {
  const result = await listWorkspaces(accessToken);
  if (result.kind !== "ok") return result;
  const saved = (await cookies()).get(COOKIE)?.value;
  const active = result.items.find(({ id }) => id === saved) ?? result.items[0];
  return { ...result, active };
}

/** Call only after the backend has confirmed access to this workspace. */
export async function saveActiveWorkspace(id: string) {
  (await cookies()).set(COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
}
