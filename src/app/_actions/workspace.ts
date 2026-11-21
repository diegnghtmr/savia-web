"use server";

import { createHash } from "node:crypto";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/session";
import { saveActiveWorkspace } from "@/lib/workspace-context";
import {
  createWorkspace,
  listWorkspaces,
  WORKSPACE_ID,
} from "@/lib/workspace-gateway";

const unavailable = "Este espacio ya no está disponible.";

export async function selectWorkspace(
  _previous: string | null,
  form: FormData,
): Promise<string | null> {
  const { accessToken } = await requireSession();
  const ids = form.getAll("workspaceId");
  const [id] = ids;
  if (ids.length !== 1 || typeof id !== "string" || !WORKSPACE_ID.test(id))
    return unavailable;
  return activateWorkspace(accessToken, id);
}

async function activateWorkspace(
  accessToken: string,
  id: string,
): Promise<string> {
  const result = await listWorkspaces(accessToken);
  if (result.kind === "unauthenticated") redirect("/sign-in");
  if (result.kind === "failed") return "No pudimos consultar tus espacios.";
  const workspace = result.items.find((item) => item.id === id);
  if (!workspace) return unavailable;

  await saveActiveWorkspace(workspace.id);
  redirect("/overview");
}

export async function createWorkspaceAction(
  nonce: string,
  _previous: string | null,
  form: FormData,
): Promise<string | null> {
  const { accessToken } = await requireSession();
  const name = String(form.get("name") ?? "").trim();
  const baseCurrency = String(form.get("baseCurrency") ?? "")
    .trim()
    .toUpperCase();
  if (
    !name ||
    name.length > 120 ||
    !/^[A-Z]{3}$/.test(baseCurrency) ||
    !WORKSPACE_ID.test(nonce)
  )
    return "Revisa el nombre y la moneda base del espacio.";

  const draft = { name, baseCurrency };
  // UUIDv8 from the form's nonce and normalized payload. Retries retain it;
  // editing a field uses a different key for the new logical request.
  const hex = createHash("sha256")
    .update(JSON.stringify([nonce, draft]))
    .digest("hex");
  const key = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-8${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
  const result = await createWorkspace(accessToken, draft, key);
  if (result.kind === "unauthenticated") redirect("/sign-in");
  if (result.kind === "failed")
    return "No pudimos crear el espacio. Vuelve a intentarlo.";
  return activateWorkspace(accessToken, result.id);
}
