import { render, screen } from "@testing-library/react";
import Credentials from "@/app/(workspace)/ai-credentials/page";
import ApprovalDetail from "@/app/(workspace)/approvals/[approvalId]/page";
import { approveDevice } from "@/app/_actions/cli-device";
import { saveCapability } from "@/app/_actions/capabilities";
import { requireSession } from "@/lib/session";

const workspaceId = "80000000-0000-4000-8000-000000000001";
const userId = "80000000-0000-4000-8000-000000000002";
const id = "80000000-0000-4000-8000-000000000003";
const offlineSecret = "fixture-only-quartz";
let jar: Map<string, string>;
let clock: number;
let role: string;
let workspaceKind: string;
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
  role = "owner";
  workspaceKind = "family";
  respond = () => Response.json({ id }, { status: 201 });
  vi.stubEnv("BACKEND_BASE_URL", "https://backend.test");
  vi.stubEnv("SUPABASE_URL", "https://auth.test");
  vi.stubEnv("SUPABASE_ANON_KEY", "offline-only");
  send.mockImplementation(() => respond());
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    const { pathname } = new URL(url);
    if (pathname === "/v1/me") return Response.json({ id: userId });
    if (pathname === "/v1/workspaces") {
      const kind = workspaceKind;
      const workspace = { id: workspaceId, name: "Casa", role, kind };
      const pageInfo = { hasNextPage: false };
      return Response.json(
        { items: [workspace], pageInfo },
        { headers: { date: new Date(clock).toUTCString() } },
      );
    }
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

it("validates CLI codes before session and rejects a changed profile", async () => {
  const original = new Map(jar);
  const duplicate = input({ userCode: "ABCD-EFGH" });
  duplicate.append("userCode", "ABCDEFGH");
  for (const form of [duplicate, input({ userCode: "IIII-0000" })]) {
    expect(await approveDevice(userId, null, form)).toEqual({
      error: "Revisa el código del dispositivo.",
    });
  }
  expect(requireSession).not.toHaveBeenCalled();
  expect(
    await approveDevice(id, null, input({ userCode: "ABCD-EFGH" })),
  ).toEqual({ error: "La sesión cambió. Vuelve a abrir el formulario." });
  expect(send).not.toHaveBeenCalled();
  expect(jar).toEqual(original);
});

it.each([204, 400, 429])(
  "handles device approval response %s without exposing the code",
  async (status) => {
    const original = new Map(jar);
    respond = () => new Response(null, { status });
    const result = await approveDevice(
      userId,
      null,
      input({ userCode: " abcd-efgh " }),
    );
    const expected = {
      204: { approved: true },
      400: { error: "El código no es válido o ya caducó." },
      429: { error: "Demasiados intentos. Inténtalo más tarde." },
    };
    expect(result).toEqual(expected[status as keyof typeof expected]);
    expect(send).toHaveBeenCalledOnce();
    const [route, request] = send.mock.calls[0];
    expect(route).toBe("/v1/cli/device/approve");
    expect(request).toMatchObject({
      method: "POST",
      cache: "no-store",
      body: JSON.stringify({ userCode: "ABCDEFGH" }),
    });
    expect(new Headers(request.headers).get("x-workspace-id")).toBeNull();
    expect(jar).toEqual(original);
  },
);

const grantInput = () =>
  input({
    clientName: "Mi asistente",
    scope: "transactions:write",
    cap: "12,34",
    currency: "cop",
    expiresAt: "2026-02-01T00:00",
    schedule: "1 08:00 24:00",
    tools: "create_transaction",
  });

it("rejects invalid grant caps and restrictions before session", async () => {
  const original = new Map(jar);
  for (const [field, value] of [
    ["cap", "-0,01"],
    ["scope", "invalid:write"],
    ["expiresAt", "2026-02-30T10:00"],
    ["tools", "unannotated_tool"],
    ["schedule", "1 20:00 06:00"],
  ]) {
    const form = grantInput();
    form.set(field, value);
    expect(await saveCapability(bind("grant-create"), null, form)).toEqual({
      error: "Revisa los datos del formulario.",
    });
  }
  expect(requireSession).not.toHaveBeenCalled();
  expect(send).not.toHaveBeenCalled();
  expect(jar).toEqual(original);
});

it("uses verified workspace and clock for exact, idempotent MCP grant creation", async () => {
  const form = grantInput();
  const original = new Map(jar);
  const bound = bind("grant-create");
  expect(
    await saveCapability(bind("grant-create", { workspaceId: id }), null, form),
  ).toEqual({
    error: "El espacio o la sesión cambió. Vuelve a abrir el formulario.",
  });
  clock = Date.parse("2026-02-01T00:00:00Z");
  expect(await saveCapability(bound, null, form)).toEqual({
    error: "La caducidad debe ser posterior a la hora del servicio.",
  });
  expect(jar).toEqual(original);
  expect(send).not.toHaveBeenCalled();
  clock = Date.parse("2026-01-01T00:00:00Z");
  await reserve(bound, form);
  expect(send).not.toHaveBeenCalled();
  expect(await saveCapability(bound, null, form)).toMatchObject({
    receipt: expect.any(String),
    href: "/mcp-grants",
  });
  expect(send).toHaveBeenCalledOnce();
  const [route, request] = send.mock.calls[0];
  expect(route).toBe("/v1/mcp/grants");
  expect(request.method).toBe("POST");
  const headers = new Headers(request.headers);
  expect(headers.get("x-workspace-id")).toBeNull();
  expect(headers.get("idempotency-key")).toMatch(/^[\da-f-]{36}$/);
  expect(JSON.parse(String(request.body))).toEqual({
    clientName: "Mi asistente",
    scopes: ["transactions:write"],
    workspaceIds: [workspaceId],
    maxWriteAmount: { amountMinor: "1234", currency: "COP" },
    schedule: [{ dayOfWeek: 1, startTime: "08:00", endTime: "24:00" }],
    toolAllowlist: ["create_transaction"],
    expiresAt: "2026-02-01T00:00:00.000Z",
  });
});

it("revokes a personal MCP grant with an idempotency key", async () => {
  const form = input({ revoke: "yes" });
  const bound = bind("grant-revoke", { id });
  respond = () => new Response(null, { status: 204 });
  await reserve(bound, form);
  expect(send).not.toHaveBeenCalled();
  expect(await saveCapability(bound, null, form)).toMatchObject({
    href: "/mcp-grants",
  });
  const [route, request] = send.mock.calls[0];
  expect(route).toBe(`/v1/mcp/grants/${id}`);
  expect(request.method).toBe("DELETE");
  expect(new Headers(request.headers).get("idempotency-key")).toMatch(
    /^[\da-f-]{36}$/,
  );
});

it("validates invitations before session and checks verified workspace roles", async () => {
  const original = new Map(jar);
  const bound = bind("member-invite");
  const bad = input({ email: "invalid", role: "owner" });
  expect(await saveCapability(bound, null, bad)).toEqual({
    error: "Revisa los datos del formulario.",
  });
  expect(requireSession).not.toHaveBeenCalled();
  const form = input({ email: "Teammate@example.test", role: "owner" });
  role = "administrator";
  expect(await saveCapability(bound, null, form)).toEqual({
    error: "Solo un propietario puede conceder el rol de propietario.",
  });
  role = "viewer";
  expect(await saveCapability(bound, null, form)).toEqual({
    error: "No tienes permiso para gestionar miembros.",
  });
  role = "owner";
  workspaceKind = "personal";
  expect(await saveCapability(bound, null, form)).toEqual({
    error: "El espacio personal no admite cambios de miembros.",
  });
  expect(send).not.toHaveBeenCalled();
  expect(jar).toEqual(original);
});

it.each([
  ["member-invite", "POST", "/invitations", 201],
  ["member-role", "PATCH", `/members/${id}`, 200],
  ["member-remove", "DELETE", `/members/${id}`, 204],
] as const)(
  "scopes %s to the verified workspace",
  async (kind, method, path, status) => {
    const form = input({
      email: "Teammate@example.test",
      role: "viewer",
      remove: "yes",
    });
    const bound = bind(kind, { id });
    respond = () => new Response(null, { status });
    await reserve(bound, form);
    expect(send).not.toHaveBeenCalled();
    expect(await saveCapability(bound, null, form)).toMatchObject({
      href: "/members",
    });
    const [route, request] = send.mock.calls[0];
    expect(route).toBe(`/v1/workspaces/${workspaceId}${path}`);
    expect(request.method).toBe(method);
    expect(new Headers(request.headers).get("idempotency-key")).toMatch(
      /^[\da-f-]{36}$/,
    );
    if (method === "POST")
      expect(JSON.parse(String(request.body))).toEqual({
        email: "teammate@example.test",
        role: "viewer",
      });
    if (method === "PATCH")
      expect(JSON.parse(String(request.body))).toEqual({ role: "viewer" });
    if (method === "DELETE") expect(request.body).toBeUndefined();
  },
);

it.each(["member-role", "member-remove"])(
  "honors last-owner protection for %s",
  async (kind) => {
    const form = input({ role: "viewer", remove: "yes" });
    const bound = bind(kind, { id });
    respond = () =>
      Response.json(
        { type: "https://savia.app/problems/last-owner-required" },
        { status: 409 },
      );
    await reserve(bound, form);
    expect(await saveCapability(bound, null, form)).toEqual({
      error: "Debe permanecer al menos un propietario activo.",
    });
    expect(send).toHaveBeenCalledOnce();
  },
);

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

it("allows replacing a credential returned with only the OpenAPI metadata", async () => {
  send.mockImplementation((path) => {
    if (path === "/v1/ai/providers")
      return Response.json([
        { providerId: "openai", enabled: true, credentialTypes: ["api_key"] },
      ]);
    expect(path).toBe("/v1/ai/credentials");
    return Response.json([
      {
        id,
        ownerType: "user",
        ownerSubjectId: userId,
        providerId: "openai",
        credentialType: "api_key",
        maskedIdentifier: "••••4321",
        status: "active",
        createdAt: "2026-01-01T00:00:00Z",
        version: 0,
      },
    ]);
  });
  render(await Credentials());
  const masked = screen.getByRole("heading", { name: "openai · ••••4321" });
  expect(masked).toBeVisible();
  const replace = screen.getByRole("button", { name: "Reemplazar clave" });
  expect(replace).toBeEnabled();
});

it.each([userId, id, "invalid", undefined])(
  "only renders approval decision controls for the verified creator (%s)",
  async (createdBy) => {
    respond = () =>
      Response.json({
        id,
        createdBy,
        toolName: "Registrar gasto",
        riskClass: "financial_write",
        argumentsHash: "hash-from-proposal",
        status: "pending",
        expiresAt: "2026-02-01T00:00:00Z",
        preview: { description: "Propuesta visible" },
      });
    render(
      await ApprovalDetail({
        params: Promise.resolve({ approvalId: id }),
        searchParams: Promise.resolve({}),
      }),
    );
    expect(screen.getByText(/Propuesta visible/)).toBeVisible();
    for (const name of ["Aprobar propuesta", "Rechazar propuesta"]) {
      const button = screen.queryByRole("button", { name });
      if (createdBy === userId) expect(button).toBeEnabled();
      else expect(button).not.toBeInTheDocument();
    }
    if (createdBy !== userId) {
      const reason = "Solo quien creó la propuesta puede decidir.";
      expect(screen.getByText(reason)).toBeVisible();
    }
  },
);

it.each(["confirm", "reject"])(
  "shows the creator-only error for a denied %s",
  async (kind) => {
    const bound = bind(kind, { id, argumentsHash: "hash-from-proposal" });
    const form = input();
    await reserve(bound, form);
    respond = () => new Response(null, { status: 403 });
    expect(await saveCapability(bound, null, form)).toEqual({
      error: "Solo quien creó la propuesta puede decidir.",
    });
    expect(send).toHaveBeenCalledOnce();
  },
);

it("dispatches a credential's zero version as one strong If-Match tag", async () => {
  const bound = bind("credential-replace", { id, version: '"0"' });
  const form = input({ secret: offlineSecret });
  await reserve(bound, form);
  respond = () => Response.json({ replacementSecret: offlineSecret });
  const result = await saveCapability(bound, null, form);
  expect(result).toHaveProperty("receipt");
  expect(send).toHaveBeenCalledOnce();
  const headers = new Headers(send.mock.calls[0][1].headers);
  expect(headers.get("if-match")).toBe('"0"');
  expect(JSON.stringify(result)).not.toContain(offlineSecret);
  expect([...jar.values()].join()).not.toContain(offlineSecret);
});

it.each([409, 412])(
  "refreshes a replacement conflict (%s) without redispatching",
  async (status) => {
    const bound = bind("credential-replace", { id, version: '"4"' });
    const form = input({ secret: offlineSecret });
    await reserve(bound, form);
    respond = () => Response.json({}, { status });
    await expect(saveCapability(bound, null, form)).rejects.toThrow(
      "redirect:/ai-credentials?actualizada=1",
    );
    expect(send).toHaveBeenCalledOnce();
    expect([...jar.values()].join()).not.toContain(offlineSecret);
  },
);
