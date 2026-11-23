"use server";

import { redirect } from "next/navigation";
import { agentAnswer } from "@/lib/agent-stream";
import {
  capabilityCommand,
  creatorOnly,
  type CapabilityBinding,
} from "@/lib/capability-input";
import { dataAccess, dataId, dataObject } from "@/lib/data-access";
import { admitDraftSeed, persistentDraft } from "@/lib/draft-idempotency";
import { prepareDraft } from "@/lib/draft-preparation";
import { draftWarning } from "@/lib/draft-retry";
import { insightsTransport } from "@/lib/insights-gateway";
import { loadServerConfig } from "@/lib/server-config";
import { canManageMembers, canWriteWorkspace } from "@/lib/workspace-roles";

// These writes may replace or remove the form in the updated server tree.
const refreshOnSuccess = new Set([
  "credential-remove",
  "credential-replace",
  "grant-revoke",
  "member-role",
  "member-remove",
  "fund-edit",
  "fund-withdraw",
]);

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
  const fund = bound.kind.startsWith("fund-");
  const subscription = bound.kind.startsWith("subscription-");
  const overviewQuery = new URLSearchParams(
    subscription ? bound.period : undefined,
  );
  const fundHref = `/funds/${dataId(bound.id)}`;
  if ((fund || subscription) && !canWriteWorkspace(access.workspace.role))
    return { error: "No tienes permiso para modificar este espacio." };
  const members = bound.kind.startsWith("member-");
  if (members) {
    const { role, kind } = access.workspace;
    if (!canManageMembers(role))
      return { error: "No tienes permiso para gestionar miembros." };
    if (kind === "personal") {
      const error = "El espacio personal no admite cambios de miembros.";
      return { error };
    }
    if (!kind) return failed;
    if (role !== "owner" && command.memberRole === "owner") {
      const error = "Solo un propietario puede conceder el rol de propietario.";
      return { error };
    }
  }
  if (command.expiresAt) {
    const now = access.workspace.serverTime;
    if (now === null)
      return { error: "No pudimos verificar la hora del servicio." };
    if (Date.parse(command.expiresAt) <= now) {
      const error = "La caducidad debe ser posterior a la hora del servicio.";
      return { error };
    }
  }
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
    const status = response?.status;
    const decision = bound.kind === "confirm" || bound.kind === "reject";
    if (decision && status === 403) return { error: creatorOnly };
    if (status === 412 && bound.kind === "confirm")
      redirect(`/approvals/${dataId(bound.id)}?actualizada=1`);
    const credentialConflict = status === 409 || status === 412;
    if (bound.kind === "credential-replace" && credentialConflict)
      redirect("/ai-credentials?actualizada=1");
    if (fund && status === 412) redirect(`${fundHref}?actualizado=1`);
    if (subscription && (status === 409 || status === 412)) {
      const state = status === 409 ? "resuelta" : "actualizada";
      overviewQuery.set("suscripcion", state);
      redirect(`/overview?${overviewQuery}`);
    }
    if (bound.kind === "fund-withdraw") {
      if (status === 409) {
        const error =
          "El retiro supera el saldo guardado o entra en conflicto con otro movimiento.";
        return { error };
      }
      if (status === 422) {
        const problem = await dataObject(response);
        const code = "insufficient-fund-balance";
        const type = `https://savia.app/problems/${code}`;
        const insufficient = problem?.code === code || problem?.type === type;
        const error = insufficient
          ? "El saldo guardado del fondo no es suficiente para este retiro."
          : "Revisa el importe y la cuenta de destino.";
        return { error };
      }
    }
    if (response?.status === 412)
      return { error: "Los datos cambiaron. Recarga la página." };
    if (bound.kind === "grant-create" && response?.status === 403)
      return { error: "Tu rol no permite conceder esos permisos." };
    if (bound.kind === "grant-create" && response?.status === 422) {
      const error = "El servicio no aceptó las restricciones del permiso.";
      return { error };
    }
    if (members && response?.status === 403)
      return { error: "No tienes permiso para gestionar esos miembros." };
    if (members && response?.status === 409) {
      const problem = await dataObject(response);
      if (problem?.type === "https://savia.app/problems/last-owner-required")
        return { error: "Debe permanecer al menos un propietario activo." };
      return { error: "La solicitud entra en conflicto con el estado actual." };
    }
    if (response?.status !== command.status) return failed;
    const answer = chat ? await agentAnswer(response) : undefined;
    if (answer === null) return failed;
    const conversation = bound.kind === "conversation";
    const id = conversation ? dataId((await dataObject(response))?.id) : null;
    if (conversation && !id) return failed;
    key.receipt(key.key);
    if (subscription) {
      overviewQuery.set("guardado", key.key);
      redirect(`/overview?${overviewQuery}`);
    }
    const target = id ? `/assistant?conversation=${id}` : doneHref(bound.kind);
    const href = fund ? fundHref : target;
    if (href && refreshOnSuccess.has(bound.kind))
      redirect(`${href}?guardado=${key.key}`);
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
  if (kind.startsWith("grant-")) return "/mcp-grants";
  if (kind.startsWith("member-")) return "/members";
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
