import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { E2E_USER } from "../fixtures.ts";
import { ONBOARDED_USER, RECOVERY_USER } from "./accounts.mjs";

// This server is test-only and accepts only credentials and sessions it issues.
const accounts = [E2E_USER, ONBOARDED_USER, RECOVERY_USER];
const sessions = new Map();
const uuid = /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i;
const encode = (value) =>
  Buffer.from(JSON.stringify(value)).toString("base64url");

function userRecord(email) {
  return {
    id: randomUUID(),
    email,
    aud: "authenticated",
    role: "authenticated",
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: {},
    created_at: new Date().toISOString(),
  };
}

function workspace(name, baseCurrency = "COP", kind = "personal") {
  return {
    id: randomUUID(),
    name,
    kind,
    baseCurrency,
    role: "owner",
    createdAt: new Date().toISOString(),
    version: 1,
  };
}

async function readJson(request) {
  let source = "";
  for await (const chunk of request) {
    source += chunk;
    if (source.length > 8192) throw new Error("fixture body too large");
  }
  return JSON.parse(source);
}

async function handle(request, reply) {
  const url = new URL(request.url, "http://127.0.0.1:4010");
  const route = `${request.method} ${url.pathname}`;
  const json = (status, body) =>
    reply
      .writeHead(status, { "content-type": "application/json" })
      .end(JSON.stringify(body));
  const bearer = request.headers.authorization;
  const session = sessions.get(bearer);
  const unauthorized = () => json(401, { message: "No fixture session" });

  switch (route) {
    case "GET /ready":
      return reply.writeHead(204).end();
    case "POST /auth/v1/token": {
      const { email, password } = await readJson(request);
      const account = accounts.find(
        (entry) => entry.email === email && entry.password === password,
      );
      if (url.searchParams.get("grant_type") !== "password" || !account)
        return json(400, {
          code: "invalid_credentials",
          msg: "Invalid fixture credentials",
        });

      const user = userRecord(email);
      const exp = Math.floor(Date.now() / 1000) + 3600;
      const token = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: user.id, exp })}.fixture`;
      // Separate sessions keep workspace mutations isolated across runs/workers.
      sessions.set(`Bearer ${token}`, {
        user,
        onboarded: account !== E2E_USER,
        workspaces:
          account === ONBOARDED_USER
            ? [workspace("Casa"), workspace("Oficina")]
            : [],
        replays: new Map(),
      });
      return json(200, {
        user,
        access_token: token,
        refresh_token: randomUUID(),
        token_type: "bearer",
        expires_in: 3600,
        expires_at: exp,
      });
    }
    case "POST /auth/v1/signup": {
      const { email } = await readJson(request);
      if (typeof email !== "string" || !email.endsWith("@savia.local"))
        return json(400, { message: "Expected local signup email" });
      return json(200, userRecord(email));
    }
    case "GET /auth/v1/user":
      return session ? json(200, session.user) : unauthorized();
    case "POST /auth/v1/logout":
      if (!session) return unauthorized();
      sessions.delete(bearer);
      return reply.writeHead(204).end();
    case "GET /v1/me":
      if (!session) return unauthorized();
      if (!session.onboarded) return json(404, { title: "Profile not found" });
      return json(200, {
        id: session.user.id,
        email: session.user.email,
        displayName: "Cuenta de prueba",
        locale: "es-CO",
        timezone: "America/Bogota",
        defaultCurrency: "COP",
      });
    case "GET /v1/workspaces":
      if (!session) return unauthorized();
      return json(200, {
        items: session.workspaces,
        pageInfo: { hasNextPage: false, nextCursor: null },
      });
    case "POST /v1/workspaces": {
      if (!session) return unauthorized();
      const key = request.headers["idempotency-key"];
      const { name, baseCurrency } = await readJson(request);
      if (
        typeof key !== "string" ||
        !uuid.test(key) ||
        typeof name !== "string" ||
        !name.trim() ||
        !/^[A-Z]{3}$/.test(baseCurrency)
      )
        return json(400, { title: "Invalid workspace request" });
      const draft = JSON.stringify({ name, baseCurrency });
      const replay = session.replays.get(key);
      if (replay)
        return replay.draft === draft
          ? json(201, replay.created)
          : json(409, { title: "Idempotency conflict" });
      const created = workspace(name, baseCurrency, "family");
      session.workspaces.push(created);
      session.replays.set(key, { draft, created });
      return json(201, created);
    }
    default:
      return json(404, { message: "Unsupported fixture route" });
  }
}

createServer((request, reply) => {
  void handle(request, reply).catch(() => {
    reply.writeHead(400).end();
  });
}).listen(4010, "127.0.0.1");
