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
  const json = (status, body, headers) =>
    reply
      .writeHead(status, { "content-type": "application/json", ...headers })
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
        accounts: new Map(),
        openings: new Map(),
        ledger: new Map(),
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
      if (url.pathname.startsWith("/v1/accounts")) {
        if (!session) return unauthorized();
        return handleAccounts(request, url, session, json);
      }
      if (
        /^GET \/v1\/(transactions(?:\/[^/]+)?|categories|payees|tags)$/.test(
          route,
        )
      ) {
        if (!session) return unauthorized();
        const space = session.workspaces.find(
          ({ id }) => id === request.headers["x-workspace-id"],
        );
        return space ? handleLedger(session, space, url, json) : json(403, {});
      }
      return json(404, { message: "Unsupported fixture route" });
  }
}

function accountResource(draft, now) {
  return {
    id: randomUUID(),
    status: "active",
    includeInNetWorth: true,
    version: 1,
    createdAt: now,
    updatedAt: now,
    ...draft,
  };
}

function accountsFor(session, space, now) {
  if (!session.accounts.has(space.id)) {
    session.accounts.set(
      space.id,
      space.name === "Casa"
        ? [
            accountResource(
              { name: "Caja", type: "cash", currency: "COP" },
              now,
            ),
          ]
        : [],
    );
  }
  return session.accounts.get(space.id);
}

async function handleAccounts(request, url, session, json) {
  const space = session.workspaces.find(
    ({ id }) => id === request.headers["x-workspace-id"],
  );
  if (!space) return json(403, { title: "Workspace access denied" });
  const now = new Date().toISOString();
  const rows = accountsFor(session, space, now);
  if (url.pathname === "/v1/accounts" && request.method === "POST") {
    const key = request.headers["idempotency-key"];
    if (!uuid.test(key)) return json(400, { title: "Missing idempotency key" });
    const body = await readJson(request);
    const draft = JSON.stringify(body);
    const replayKey = `accounts:${space.id}:${key}`;
    const replay = session.replays.get(replayKey);
    if (replay)
      return replay.draft === draft ? json(201, replay.created) : json(409, {});
    const { openingBalance, openingBalanceDate, ...fields } = body;
    const created = accountResource(fields, now);
    if (openingBalance)
      session.openings.set(created.id, { openingBalance, openingBalanceDate });
    rows.push(created);
    session.replays.set(replayKey, { draft, created });
    return json(201, created);
  }
  if (url.pathname === "/v1/accounts" && request.method === "GET") {
    const status = url.searchParams.get("status");
    return json(200, {
      items: status ? rows.filter((row) => row.status === status) : rows,
      pageInfo: { hasNextPage: false },
    });
  }
  const [, accountId, operation] =
    /^\/v1\/accounts\/([^/]+)(?:\/(balance|close))?$/.exec(url.pathname) ?? [];
  const index = rows.findIndex(({ id }) => id === accountId);
  const row = rows[index];
  if (!row) return json(404, {});
  const etag = (account) => ({ etag: `"${account.version}"` });
  if (request.method === "GET" && !operation) return json(200, row, etag(row));
  const replace = (patch) =>
    (rows[index] = {
      ...row,
      ...patch,
      version: row.version + 1,
      updatedAt: now,
    });
  if (request.method === "PATCH" && !operation) {
    if (row.status === "closed") return json(403, {});
    if (request.headers["if-match"] !== etag(row).etag) return json(412, {});
    const updated = replace(await readJson(request));
    return json(200, updated, etag(updated));
  }
  if (request.method === "POST" && operation === "close") {
    const key = request.headers["idempotency-key"];
    if (!uuid.test(key)) return json(400, {});
    const replayKey = `close:${space.id}:${key}`;
    const replay = session.replays.get(replayKey);
    if (replay)
      return replay.id === accountId ? json(200, replay) : json(409, {});
    if (row.status === "closed") return json(409, {});
    if (request.headers["if-match"] !== etag(row).etag) return json(412, {});
    const closed = replace({ status: "closed" });
    session.replays.set(replayKey, closed);
    return json(200, closed);
  }
  if (request.method !== "GET" || operation !== "balance") return json(404, {});
  const nativeBalance = session.openings.get(row.id)?.openingBalance ?? {
    currency: row.currency,
    amountMinor: space.name === "Casa" && index === 0 ? "127500" : "0",
  };
  return json(200, {
    accountId: row.id,
    nativeBalance,
    pendingBalance: { currency: row.currency, amountMinor: "0" },
    reconciledBalance: nativeBalance,
    asOf: now,
    baseCurrencyEquivalent: {
      original: nativeBalance,
      converted: nativeBalance,
      rate: "1",
      rateDate: now.slice(0, 10),
      rateSource: "fixture",
    },
  });
}

function handleLedger(session, space, url, json) {
  const [account] = accountsFor(session, space, new Date().toISOString());
  const named = (name) => ({ id: randomUUID(), name });
  if (!session.ledger.has(space.id)) {
    const category = named("Alimentación"),
      payee = named("Mercado"),
      tag = named("Familia");
    const transactions =
      space.name === "Casa"
        ? [
            ["Mercado sin confirmar", "2026-01-31", "pending"],
            ["Mercado de hoy", "2026-01-25", "confirmed"],
            ["Mercado anterior", "2026-01-15", "confirmed"],
          ].map(([description, day, status]) => ({
            id: randomUUID(),
            accountId: account.id,
            categoryId: category.id,
            payeeId: payee.id,
            tagIds: [tag.id],
            type: "expense",
            status,
            description,
            amount: { amountMinor: "123456", currency: "COP" },
            notes: "Pago en efectivo",
            occurredAt: `${day}T12:00:00Z`,
            createdAt: `${day}T12:00:00Z`,
            updatedAt: `${day}T12:00:00Z`,
            version: 1,
          }))
        : [];
    session.ledger.set(space.id, {
      categories: [category],
      payees: [payee],
      tags: [tag],
      transactions,
    });
  }
  const ledger = session.ledger.get(space.id);
  const [, , resource, id] = url.pathname.split("/");
  if (id) {
    const row = ledger.transactions.find((entry) => entry.id === id);
    return row ? json(200, row, { etag: '"1"' }) : json(404, {});
  }
  const get = (key) => url.searchParams.get(key);
  const rows = ledger[resource];
  if (resource !== "transactions")
    return json(200, { items: rows, pageInfo: { hasNextPage: false } });
  const results = rows.filter(
    (row) =>
      ["accountId", "categoryId", "status"].every(
        (key) => !get(key) || row[key] === get(key),
      ) &&
      (!get("from") || row.occurredAt.slice(0, 10) >= get("from")) &&
      (!get("to") || row.occurredAt.slice(0, 10) <= get("to")) &&
      (!get("query") ||
        row.description.toLowerCase().includes(get("query").toLowerCase())),
  );
  const cursor = (row) => encode([row.createdAt, row.id]);
  const offset = get("cursor")
    ? results.findIndex((row) => cursor(row) === get("cursor")) + 1
    : 0;
  if (get("cursor") && !offset) return json(400, {});
  const hasNextPage = results.length > offset + 1;
  return json(200, {
    items: results.slice(offset, offset + 1),
    pageInfo: {
      hasNextPage,
      nextCursor: hasNextPage ? cursor(results[offset]) : null,
    },
  });
}

createServer((request, reply) => {
  void handle(request, reply).catch(() => {
    reply.writeHead(400).end();
  });
}).listen(4010, "127.0.0.1");
