"use server";

import { redirect } from "next/navigation";
import { requireSession } from "@/lib/session";
import { saveActiveWorkspace } from "@/lib/workspace-context";
import { listWorkspaces, WORKSPACE_ID } from "@/lib/workspace-gateway";

export async function selectWorkspace(
  _previous: string | null,
  form: FormData,
): Promise<string | null> {
  const { accessToken } = await requireSession();
  const id = form.get("workspaceId");
  const unavailable = "Este espacio ya no está disponible.";
  if (typeof id !== "string" || !WORKSPACE_ID.test(id)) return unavailable;

  const result = await listWorkspaces(accessToken);
  if (result.kind === "unauthenticated") redirect("/sign-in");
  if (result.kind === "failed") return "No pudimos consultar tus espacios.";
  const workspace = result.items.find((item) => item.id === id);
  if (!workspace) return unavailable;

  await saveActiveWorkspace(workspace.id);
  redirect("/overview");
}
