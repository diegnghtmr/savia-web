import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { draftCookieOptions, draftSeedCookie } from "./draft-cookie";
import { admitOneShotDraft, consumeOneShotDraft } from "./draft-one-shot";
import {
  draftReserved,
  isDraftPreparation,
  shouldAdmitDraft,
} from "./draft-preparation";
import { draftConfirmation } from "./draft-retry";
import { requireProfile } from "./require-profile";
import { readWorkspaceContext } from "./workspace-context";
import { WORKSPACE_ID } from "./workspace-gateway";

const digest = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
function keyFor(value: unknown) {
  const hex = digest(value);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-8${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

const options = { ...draftCookieOptions, path: "/" };
const stateName = "savia-draft-state";
const safeWindow = 23 * 60 * 60 * 1000;
const budget = 3500; // ASCII value, with room for both cookie names and the seed.
const historyBytes = 768;
const placeholder = "00000000-0000-0000-0000-000000000000";
const hex = (value: string) => /^[\da-f]{32}$/.test(value);
const uuid = (value: string) => WORKSPACE_ID.test(value);
const stamp = (time: number | null) => time?.toString(36) ?? "";
const interval = (since: string, current: number | null) =>
  since && current !== null ? current - Number.parseInt(since, 36) : null;
const fresh = (since: string, current: number | null) => {
  const elapsed = interval(since, current);
  return elapsed !== null && elapsed >= 0 && elapsed < safeWindow;
};
const activeScope = (seed: string, workspaceId: string, userId: string) =>
  digest([seed, workspaceId, userId]).slice(0, 32);

type Store = Awaited<ReturnType<typeof cookies>>;
type Entry = {
  hash: string;
  scope: string;
  generation: string;
  since: string;
  status: "pending" | "confirmed";
  receipt: string;
  resource: string;
  challenge: string;
  permit: string;
};
type State = { history: Buffer; entries: Entry[]; valid: boolean };
type DraftAttempt = {
  key: string;
  confirmation?: string;
  payload: object;
  receipt: (id: string, resource?: string) => void;
};

function seedFor(store: Store) {
  const [id, policy] = (store.get(draftSeedCookie)?.value ?? "").split(".");
  if (!uuid(id)) return null;
  return { id, policy };
}

async function verifiedDraftScope() {
  const profile = await requireProfile();
  if (profile.kind !== "ready") return null;
  const context = await readWorkspaceContext(profile.accessToken);
  return context.kind === "ok" && context.active
    ? { ...context.active, userId: profile.userId }
    : null;
}

export async function admitDraftSeed(workspaceId: string) {
  if (!uuid(workspaceId) || (await verifiedDraftScope())?.id !== workspaceId)
    return false;
  initializeDraftSeed(await cookies());
  return true;
}

function initializeDraftSeed(store: Store) {
  const seed = seedFor(store);
  if (seed?.policy === "ready" || seed?.policy === "legacy") return;
  // Older browsers have no trustworthy membership timestamp for unresolved writes.
  store.set(
    draftSeedCookie,
    `${seed?.id ?? randomUUID()}.${seed ? "legacy" : "ready"}`,
    options,
  );
  if (!seed)
    store.set(
      stateName,
      `2~${Buffer.alloc(historyBytes).toString("base64url")}`,
      options,
    );
  for (const { name } of store.getAll()) {
    if (/^savia-draft-(?:[a-f0-9]{32}|receipt-[a-f0-9-]{36})$/.test(name))
      store.set(name, "", { ...options, maxAge: 0 });
  }
}

function load(store: Store): State {
  const raw = store.get(stateName)?.value ?? "";
  const [version, bitmap, ...records] =
    raw.length <= budget ? raw.split("~") : [];
  const history = Buffer.from(bitmap || "", "base64url");
  if (version !== "2" || history.length !== historyBytes)
    return { history: Buffer.alloc(historyBytes), entries: [], valid: false };
  const entries = records.flatMap((record): Entry[] => {
    const parts = record.split(".");
    const [
      hash,
      scope,
      generation,
      since,
      status,
      receipt,
      resource,
      challenge,
      permit,
    ] = parts;
    return parts.length === 9 &&
      hex(hash) &&
      hex(scope) &&
      (generation === "initial" || uuid(generation)) &&
      /^-?[\da-z]{0,11}$/.test(since) &&
      (status === "pending" || status === "confirmed") &&
      [receipt, resource, challenge, permit].every((id) => !id || uuid(id))
      ? [
          {
            hash,
            scope,
            generation,
            since,
            status,
            receipt,
            resource,
            challenge,
            permit,
          },
        ]
      : [];
  });
  return { history, entries, valid: entries.length === records.length };
}

// A forgotten generation cannot safely fall back to the original key.
// A false positive only asks for confirmation; it never authorizes a write.
function bits(hash: string) {
  return [0, 8, 16, 24].map(
    (i) => Number.parseInt(hash.slice(i, i + 8), 16) % (historyBytes * 8),
  );
}
function wasForgotten(state: State, hash: string) {
  return bits(hash).every(
    (bit) => (state.history[bit >>> 3] & (1 << (bit & 7))) !== 0,
  );
}
function save(
  store: Store,
  state: State,
  updated: Entry,
  serverTime: number | null,
) {
  let entries = [
    ...state.entries.filter(({ hash }) => hash !== updated.hash),
    updated,
  ];
  const history = Buffer.from(state.history);
  for (;;) {
    const value = [
      "2",
      history.toString("base64url"),
      ...entries.map((e) =>
        [
          e.hash,
          e.scope,
          e.generation,
          e.since,
          e.status,
          e.receipt,
          e.resource,
          e.challenge,
          e.permit,
        ].join("."),
      ),
    ].join("~");
    if (value.length <= budget) {
      store.set(stateName, value, options);
      return true;
    }
    const old = entries.find(
      (entry) =>
        entry !== updated &&
        (entry.status === "confirmed" ||
          (entry.scope === updated.scope &&
            (interval(entry.since, serverTime) ?? 0) >= safeWindow)),
    );
    if (!old) return false;
    for (const bit of bits(old.hash)) history[bit >>> 3] |= 1 << (bit & 7);
    entries = entries.filter((entry) => entry !== old);
  }
}

export async function persistentDraft(
  workspaceId: string,
  userId: string,
  route: string,
  payload: object,
  verification?: {
    serverTime: number | null;
    form: FormData;
    equivalents?: readonly object[];
  },
): Promise<DraftAttempt | null> {
  if (!verification) {
    const scope = await verifiedDraftScope();
    if (scope?.id !== workspaceId || scope.userId !== userId) return null;
    verification = { serverTime: scope.serverTime, form: new FormData() };
  }
  const { serverTime, form } = verification;
  const store = await cookies();
  // The preflight action has already validated the payload and workspace.
  if (shouldAdmitDraft()) {
    try {
      initializeDraftSeed(store);
    } catch {
      return null;
    }
  }
  const seed = seedFor(store);
  if (!seed) return null;
  const preparing = isDraftPreparation();
  const state = load(store);
  const scope = activeScope(seed.id, workspaceId, userId);
  const candidates = [payload, ...(verification.equivalents ?? [])].map(
    (body) => {
      const hash = digest([seed.id, userId, workspaceId, route, body]).slice(
        0,
        32,
      );
      const entry = state.entries.find(
        (entry) => entry.hash === hash && entry.scope === scope,
      );
      return { body, hash, entry };
    },
  );
  const ticket = form.get("draftPrepared");
  // Dispatch must use exactly the reservation chosen during preparation.
  const reserved = preparing
    ? undefined
    : candidates.find(({ entry }) => entry?.permit && entry.permit === ticket);
  const pending = candidates.find(({ entry }) => entry?.status === "pending");
  const selected = reserved ?? pending ?? candidates[0];
  const { hash, entry: saved, body } = selected;
  const prepared = !preparing && !!saved?.permit && saved.permit === ticket;
  if (!preparing && seed.policy && !prepared) return null;

  let entry: Entry = saved ?? {
    hash,
    scope,
    generation: "initial",
    since: "",
    status: "confirmed",
    receipt: "",
    resource: "",
    challenge: "",
    permit: "",
  };
  const submittedConfirmation = draftConfirmation(form);
  // Preparation has already consumed this confirmation by reserving its
  // generation in the browser. A dispatch cannot spend it a second time,
  // even when the browser still has the pre-dispatch cookie and form.
  const confirm =
    submittedConfirmation === entry.generation
      ? undefined
      : submittedConfirmation;
  const uncertain =
    !saved &&
    (seed.policy === "legacy" ||
      (!!seed.policy && !state.valid) ||
      candidates.some(({ hash }) => wasForgotten(state, hash)));
  const needsChoice =
    uncertain ||
    !!entry.challenge ||
    !!confirm ||
    serverTime === null ||
    (entry.status === "pending" && !fresh(entry.since, serverTime));
  const oneShotDispatch =
    prepared &&
    entry.since === "" &&
    submittedConfirmation === entry.generation &&
    !entry.challenge &&
    consumeOneShotDraft(entry.permit);
  let oneShotReservation = false;
  if (needsChoice && !oneShotDispatch) {
    if (!entry.challenge || confirm !== entry.challenge) {
      entry = {
        ...entry,
        status: "pending",
        challenge: entry.challenge || randomUUID(),
        permit: "",
      };
      if (!save(store, state, entry, serverTime)) return null;
      return {
        confirmation: entry.challenge,
        key: "",
        payload: body,
        receipt: () => {},
      };
    }
    oneShotReservation = preparing && serverTime === null;
    entry = {
      ...entry,
      generation: entry.challenge,
      status: "confirmed",
      challenge: "",
      receipt: "",
      resource: "",
    };
  }
  // Only the first reservation for this generation establishes its time. The
  // browser receives it before dispatch, even if the write response is lost.
  if (entry.status === "confirmed") entry.since = stamp(serverTime);
  const key = keyFor([hash, entry.generation]);
  entry = {
    ...entry,
    status: "pending",
    permit: preparing ? randomUUID() : "",
  };
  if (oneShotReservation && !admitOneShotDraft(entry.permit)) return null;
  if (
    !save(
      store,
      state,
      {
        ...entry,
        receipt: entry.receipt || placeholder,
        resource: entry.resource || placeholder,
      },
      serverTime,
    )
  ) {
    if (oneShotReservation) consumeOneShotDraft(entry.permit);
    return null;
  }
  draftReserved(entry.permit);
  return {
    key,
    payload: body,
    receipt: (id: string, resource = id) =>
      save(store, load(store), { ...entry, receipt: id, resource }, serverTime),
  };
}

export async function draftReceiptFor(
  resource: string,
  workspaceId: string,
  userId: string,
) {
  if (!uuid(resource) || resource === placeholder) return undefined;
  const store = await cookies();
  const seed = seedFor(store);
  if (!seed) return undefined;
  const state = load(store);
  if (!state.valid) return undefined;
  const scope = activeScope(seed.id, workspaceId, userId);
  // Pending entries keep the sentinel until dispatch succeeds.
  return state.entries.findLast(
    (entry) =>
      entry.scope === scope &&
      entry.resource === resource &&
      !!entry.receipt &&
      entry.receipt !== placeholder,
  )?.receipt;
}

export async function confirmDraftReceipt(id: string) {
  if (!uuid(id) || id === placeholder) return;
  const store = await cookies();
  const seed = seedFor(store);
  if (!seed) return;
  const state = load(store);
  if (!state.entries.some((entry) => entry.receipt === id)) return;
  const active = await verifiedDraftScope();
  if (!active) return;
  const scope = activeScope(seed.id, active.id, active.userId);
  const match = state.entries.findLast(
    (entry) => entry.scope === scope && entry.receipt === id,
  );
  if (!match) return;
  save(
    store,
    state,
    {
      ...match,
      receipt: "",
      resource: "",
      generation: randomUUID(),
      since: "",
      status: "confirmed",
      challenge: "",
      permit: "",
    },
    active.serverTime,
  );
}
