import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { draftCookieOptions, draftSeedCookie } from "./draft-cookie";
import { WORKSPACE_ID } from "./workspace-gateway";

const digest = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function draftKey(value: unknown) {
  const hex = digest(value);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-8${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

const options = { ...draftCookieOptions, path: "/" };
const cookieName = (hash: string) => `savia-draft-${hash}`;
const receiptName = (id: string) => `savia-draft-receipt-${id}`;
const generation = (value?: string) =>
  value && WORKSPACE_ID.test(value) ? value : "initial";

export async function persistentDraft(
  workspaceId: string,
  userId: string,
  route: string,
  payload: object,
) {
  const store = await cookies();
  const seed = store.get(draftSeedCookie)?.value;
  if (!seed || !WORKSPACE_ID.test(seed)) return null;
  const hash = digest([seed, userId, workspaceId, route, payload]).slice(0, 32);
  const name = cookieName(hash);
  // Missing state is deterministic because the whole action response may be lost.
  const current = generation(store.get(name)?.value);
  store.set(name, current, options);
  return {
    key: draftKey([hash, current]),
    receipt: (id: string) =>
      store.set(receiptName(id), `${hash}.${current}`, options),
  };
}

export async function hasDraftReceipt(id: string) {
  return (await cookies()).get(receiptName(id))?.value.includes(".") ?? false;
}

export async function confirmDraftReceipt(id: string) {
  if (!WORKSPACE_ID.test(id)) return;
  const store = await cookies();
  const receipt = receiptName(id);
  const value = store.get(receipt)?.value;
  if (!value) return;
  const [hash, confirmed] = value.split(".");
  if (
    !/^[a-f0-9]{32}$/.test(hash) ||
    (confirmed !== "initial" && !WORKSPACE_ID.test(confirmed))
  )
    return;
  const name = cookieName(hash);
  if (generation(store.get(name)?.value) === confirmed)
    store.set(name, randomUUID(), options);
  store.set(receipt, "", { ...options, maxAge: 0 });
}
