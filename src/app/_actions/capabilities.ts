"use server";

import { redirect } from "next/navigation";
import { agentAnswer } from "@/lib/agent-stream";
import {
  capabilityCommand,
  type CapabilityBinding,
} from "@/lib/capability-input";
import { dataAccess, dataId, dataObject } from "@/lib/data-access";
import { admitDraftSeed, persistentDraft } from "@/lib/draft-idempotency";
import { prepareDraft } from "@/lib/draft-preparation";
import { draftWarning } from "@/lib/draft-retry";
import { insightsTransport } from "@/lib/insights-gateway";
import { loadServerConfig } from "@/lib/server-config";

export type CapabilityState = {
  error?: string;
  confirmation?: string;
  prepared?: string;
  receipt?: string;
  href?: string;
  answer?: string;
  approvalHref?: string;
};

export async function saveCapability(
  bound: CapabilityBinding,
  _previous: CapabilityState | null,
  form: FormData,
): Promise<CapabilityState> {
  const invalid = { error: "Revisa los datos del formulario." };
  if (!dataId(bound?.workspaceId) || !dataId(bound.userId)) return invalid;
  const command = capabilityCommand(bound, form);
  const tickets = form.getAll("draftPrepared");
  const validTicket = !tickets.length || !!dataId(tickets[0]);
  if (!command || tickets.length > 1 || !validTicket) return invalid;
  const access = await dataAccess();
  const stale = "El espacio o la sesión cambió. Vuelve a abrir el formulario.";
  const sameWorkspace = access?.workspace.id === bound.workspaceId;
  if (!sameWorkspace || access.userId !== bound.userId) return { error: stale };
  const failed = { error: "No pudimos completar la solicitud." };
  if (command.fingerprint && !secureCredentialTransport()) return failed;
  const { route, method = "POST", version, body } = command;
  const invoke = async (): Promise<CapabilityState> => {
    const identity = { method, version, data: command.fingerprint ?? body };
    const key = await persistentDraft(
      bound.workspaceId,
      bound.userId,
      route,
      identity,
      { serverTime: access.workspace.serverTime, form },
    );
    if (!key) return { error: "Recarga la página para volver a intentarlo." };
    if (key.confirmation)
      return { confirmation: key.confirmation, error: draftWarning };
    const chat = bound.kind === "message";
    const request = command.personal
      ? insightsTransport(access.accessToken)
      : access.request;
    const response = await request(route, undefined, {
      method,
      headers: {
        "idempotency-key": key.key,
        ...(version && { "if-match": version }),
        ...(body && { "content-type": "application/json" }),
        ...(chat && { accept: "text/event-stream" }),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30000),
    });
    if (response?.status === 412 && bound.kind === "confirm")
      redirect(`/approvals/${dataId(bound.id)}?actualizada=1`);
    if (response?.status === 412)
      return { error: "Los datos cambiaron. Recarga la página." };
    if (response?.status !== command.status) return failed;
    const answer = chat ? await agentAnswer(response) : undefined;
    if (answer === null) return failed;
    const conversation = bound.kind === "conversation";
    const id = conversation ? dataId((await dataObject(response))?.id) : null;
    if (conversation && !id) return failed;
    key.receipt(key.key);
    const href = id ? `/assistant?conversation=${id}` : doneHref(bound.kind);
    return { receipt: key.key, href, ...answer };
  };
  if (tickets.length) return invoke();
  if (!(await admitDraftSeed(bound.workspaceId))) return failed;
  const reservation = await prepareDraft(invoke);
  return reservation.prepared
    ? { prepared: reservation.prepared }
    : (reservation.state as CapabilityState);
}

function doneHref(kind: string) {
  if (kind === "confirm" || kind === "reject") return "/approvals";
  if (kind.startsWith("credential-")) return "/ai-credentials";
  if (kind.startsWith("notification-")) return "/notifications";
}

function secureCredentialTransport() {
  try {
    const { protocol, hostname } = loadServerConfig().backendBaseUrl;
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(hostname);
    return protocol === "https:" || local;
  } catch {
    return false;
  }
}
