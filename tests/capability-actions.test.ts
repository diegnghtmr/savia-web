import { saveCapability } from "@/app/_actions/capabilities";
import { requireSession } from "@/lib/session";

const workspaceId = "80000000-0000-4000-8000-000000000001";
const userId = "80000000-0000-4000-8000-000000000002";
const id = "80000000-0000-4000-8000-000000000003";
const offlineSecret = "fixture-only-quartz";
let jar: Map<string, string>;
let clock: number;
let respond: () => Response;
const send = vi.fn<(path: string, init: RequestInit) => Response>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => ({ value: jar.get(name) }),
    getAll: () => [...jar].map(([name, value]) => ({ name, value })),
    set: (name: string, value: string) => jar.set(name, value),
  }),
}));
vi.mock("@/lib/session", () => ({
  requireSession: vi.fn(async () => ({ accessToken: "fixture" })),
}));
vi.mock("next/navigation", () => ({
  redirect: (href: string) => {
    throw new Error(`redirect:${href}`);
  },
}));
beforeEach(() => {
  vi.clearAllMocks();
  jar = new Map([["savia-workspace", workspaceId]]);
  clock = Date.parse("2026-01-01T00:00:00Z");
  respond = () => Response.json({ id }, { status: 201 });
  vi.stubEnv("BACKEND_BASE_URL", "https://backend.test");
  vi.stubEnv("SUPABASE_URL", "https://auth.test");
  vi.stubEnv("SUPABASE_ANON_KEY", "offline-only");
  send.mockImplementation(() => respond());
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    const { pathname } = new URL(url);
    if (pathname === "/v1/me") return Response.json({ id: userId });
    if (pathname === "/v1/workspaces")
      return Response.json(
        {
          items: [{ id: workspaceId, name: "Casa" }],
          pageInfo: { hasNextPage: false },
        },
        { headers: { date: new Date(clock).toUTCString() } },
      );
    return send(pathname, init);
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const bind = (kind: string, extra = {}) => ({
  kind,
  workspaceId,
  userId,
  ...extra,
});
function input(fields: Record<string, string> = {}) {
  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) form.set(name, value);
  return form;
}
async function reserve(bound: ReturnType<typeof bind>, form: FormData) {
  const result = await saveCapability(bound, null, form);
  expect(result.prepared).toEqual(expect.stringMatching(/^[\da-f-]{36}$/));
  form.set("draftPrepared", result.prepared!);
}

it("validates capability input before session", async () => {
  const original = new Map(jar);
  for (const [kind, fields] of [
    ["message", { message: "  " }],
    ["credential-add", { provider: "openai", secret: " " }],
    [
      "notification-preferences",
      { start: "22:00", end: "22:00", timezone: "UTC" },
    ],
  ] as const) {
    const form = input(fields);
    const result = await saveCapability(bind(kind, { id }), null, form);
    expect(result).toEqual({ error: "Revisa los datos del formulario." });
  }
  expect(requireSession).not.toHaveBeenCalled();
  expect(send).not.toHaveBeenCalled();
  expect(jar).toEqual(original);
});

it("creates a conversation and reads a completed event stream", async () => {
  const create = input({ title: "Resumen" });
  const bound = bind("conversation");
  await reserve(bound, create);
  expect(send).not.toHaveBeenCalled();
  expect(await saveCapability(bound, null, create)).toMatchObject({
    href: `/assistant?conversation=${id}`,
  });
  const [createPath, creation] = send.mock.calls[0];
  expect(createPath).toBe("/v1/agent/conversations");
  expect(JSON.parse(String(creation.body))).toEqual({ title: "Resumen" });
  const message = input({ message: "¿Cómo va el presupuesto?" });
  const chat = bind("message", { id });
  await reserve(chat, message);
  const frame = (type: string, data?: object) => {
    const body = { type, runId: id, timestamp: "2026-01-01T00:00:00Z", data };
    return `event: ${type}\ndata: ${JSON.stringify(body)}\n\n`;
  };
  const stream =
    frame("text_delta", { text: "Respuesta" }) + frame("run_completed");
  respond = () =>
    new Response(stream, { headers: { "content-type": "text/event-stream" } });
  expect(await saveCapability(chat, null, message)).toMatchObject({
    answer: "Respuesta",
  });
  const [path, request] = send.mock.calls[1];
  expect(path).toBe(`/v1/agent/conversations/${id}/messages`);
  const headers = new Headers(request.headers);
  expect(headers.get("accept")).toBe("text/event-stream");
  expect(headers.get("x-workspace-id")).toBe(workspaceId);
  expect(request.cache).toBe("no-store");
});

it.each(["confirm", "reject"])("scopes approval %s", async (decision) => {
  const form = input();
  const approval = bind(decision, { id, argumentsHash: "hash-from-proposal" });
  const original = new Map(jar);
  const other = { ...approval, userId: id };
  expect(await saveCapability(other, null, form)).toHaveProperty("error");
  expect(jar).toEqual(original);
  expect(send).not.toHaveBeenCalled();
  await reserve(approval, form);
  respond = () => Response.json({ id });
  const reserved = new Map(jar);
  expect(await saveCapability(approval, null, form)).toHaveProperty("receipt");
  jar = reserved;
  const retry = input();
  await reserve(approval, retry);
  if (decision === "confirm") {
    respond = () => new Response(null, { status: 412 });
    await expect(saveCapability(approval, null, retry)).rejects.toThrow(
      `redirect:/approvals/${id}?actualizada=1`,
    );
  } else {
    const result = await saveCapability(approval, null, retry);
    expect(result).toHaveProperty("receipt");
  }
  const [first, second] = send.mock.calls;
  expect(first[0]).toBe(`/v1/approvals/${id}/${decision}`);
  expect(first[1].body).toBe(
    JSON.stringify({ argumentsHash: "hash-from-proposal" }),
  );
  const headers = new Headers(first[1].headers);
  expect(headers.get("if-match")).toBeNull();
  const key = headers.get("idempotency-key");
  expect(key).toMatch(/^[\da-f-]{36}$/);
  expect(new Headers(second[1].headers).get("idempotency-key")).toBe(key);
});

it("protects credential input and checks backend freshness", async () => {
  const bound = bind("credential-add");
  const fields = { provider: "openai", secret: offlineSecret };
  const form = input(fields);
  await reserve(bound, form);
  const reserved = new Map(jar);
  respond = () => Response.json({ id, secret: offlineSecret }, { status: 201 });
  const result = await saveCapability(bound, null, form);
  expect(result).toHaveProperty("receipt");
  expect(JSON.stringify(result)).not.toContain(offlineSecret);
  expect([...jar.values()].join()).not.toContain(offlineSecret);
  const [path, request] = send.mock.calls[0];
  expect(path).toBe("/v1/ai/credentials");
  expect(JSON.parse(String(request.body))).toEqual({
    ownerType: "user",
    providerId: "openai",
    credentialType: "api_key",
    secret: offlineSecret,
  });
  jar = reserved;
  clock += 23 * 3600000;
  const retry = await saveCapability(bound, null, input(fields));
  expect(retry).toHaveProperty("confirmation");
  expect(send).toHaveBeenCalledOnce();
});

const credentialChanges = ["credential-replace", "credential-remove"];
it.each(credentialChanges)("dispatches %s", async (kind) => {
  const bound = bind(kind, { id, version: '"4"' });
  const form = input({ secret: offlineSecret });
  await reserve(bound, form);
  const rotating = kind === "credential-replace";
  respond = () => new Response(null, { status: rotating ? 200 : 204 });
  const result = await saveCapability(bound, null, form);
  expect(result).toHaveProperty("receipt");
  const [path, request] = send.mock.calls[0];
  expect(path).toBe(`/v1/ai/credentials/${id}`);
  expect(request.method).toBe(rotating ? "PATCH" : "DELETE");
  const tag = new Headers(request.headers).get("if-match");
  expect(tag).toBe(rotating ? '"4"' : null);
  const replacement = JSON.stringify({ replacementSecret: offlineSecret });
  expect(request.body).toBe(rotating ? replacement : undefined);
});

it("marks notifications read and saves personal preferences", async () => {
  const mark = bind("notification-read", { id });
  const form = input();
  await reserve(mark, form);
  respond = () => new Response(null, { status: 204 });
  expect(await saveCapability(mark, null, form)).toHaveProperty("receipt");
  const prefs = bind("notification-preferences", { version: '"2"' });
  const quietHours = {
    start: "22:30",
    end: "07:00",
    timezone: "America/Bogota",
  };
  const preference = input({ in_app: "yes", digest: "yes", ...quietHours });
  await reserve(prefs, preference);
  respond = () => Response.json({});
  const result = await saveCapability(prefs, null, preference);
  expect(result).toHaveProperty("receipt");
  expect(send.mock.calls.map(([path, req]) => [path, req.method])).toEqual([
    [`/v1/notifications/${id}/read`, "POST"],
    ["/v1/me/notification-preferences", "PUT"],
  ]);
  for (const [, request] of send.mock.calls)
    expect(new Headers(request.headers).has("x-workspace-id")).toBe(false);
  expect(JSON.parse(String(send.mock.calls[1][1].body))).toEqual({
    channels: { in_app: true, push: false, email: false },
    digestEnabled: true,
    quietHours,
  });
});
