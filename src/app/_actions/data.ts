"use server";

import { dataAccess, dataId, dataObject } from "@/lib/data-access";
import {
  dataCommand,
  type DataBinding,
  type DataResult,
} from "@/lib/data-input";
import { persistentDraft } from "@/lib/draft-idempotency";
import { draftWarning } from "@/lib/draft-retry";

export async function saveData(
  bound: DataBinding,
  _state: DataResult | null,
  form: FormData,
): Promise<DataResult> {
  const stale = "El espacio activo cambió. Vuelve a abrir el formulario.";
  const workspaceId = dataId(bound?.workspaceId);
  if (!workspaceId) return { error: stale };
  const command = await dataCommand(bound, form);
  if (typeof command === "string") return { error: command };
  const access = await dataAccess();
  if (!access || access.workspace.id !== workspaceId) return { error: stale };
  if (command.ownerOnly && !access.workspace.isOwner)
    return { error: "Solo el propietario puede crear un respaldo completo." };
  const key = await persistentDraft(
    workspaceId,
    access.userId,
    command.route,
    command.payload,
    { serverTime: access.workspace.serverTime, form },
  );
  if (!key) return { error: "Recarga la página antes de volver a intentarlo." };
  if (key.confirmation)
    return { confirmation: key.confirmation, error: draftWarning };
  const json = !command.multipart && !command.ownerOnly;
  const response = await access.request(command.route, undefined, {
    method: "POST",
    headers: {
      "idempotency-key": key.key,
      ...(json && { "content-type": "application/json" }),
    },
    body: json ? JSON.stringify(command.payload) : command.multipart,
  });
  if (command.ownerOnly && [404, 501].includes(response?.status ?? 0))
    return { error: "Respaldo completo no disponible." };
  if (response?.status === 422)
    return { error: "El servicio rechazó los datos. Revisa el formulario." };
  if (response?.status === 409)
    return {
      error: "La operación cambió. Revisa su estado antes de continuar.",
      ...(command.conflictHref && { href: command.conflictHref }),
    };
  if (response?.status !== (command.status ?? 202))
    return { error: "No pudimos completar la solicitud. Vuelve a intentarlo." };
  const receipt = dataId((await dataObject(response))?.id);
  if (!receipt) return { error: "No pudimos verificar la respuesta." };
  key.receipt(receipt);
  return { receipt, href: command.href(receipt) };
}
