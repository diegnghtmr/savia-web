import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { E2E_USER } from "../fixtures.ts";
import {
  DRAFT_CLOCK_USER,
  MEMBERS_USER,
  NO_DRAFT_CLOCK_USER,
  ONBOARDED_USER,
  RECOVERY_USER,
} from "./accounts.mjs";
import { handleBudgets } from "./budgets.mjs";
import { handleFunds } from "./funds.mjs";
import { handleDebts } from "./debts.mjs";
import { handleScenarios } from "./scenarios.mjs";
import { handleDataJobs } from "./data-jobs.mjs";
import { handleCapabilities } from "./capabilities.mjs";
import { handleMcpGrants } from "./mcp-grants.mjs";
import { handleMembers } from "./members.mjs";

// This server is test-only and accepts only credentials and sessions it issues.
const accounts = [
  E2E_USER,
  MEMBERS_USER,
  ONBOARDED_USER,
  RECOVERY_USER,
  DRAFT_CLOCK_USER,
  NO_DRAFT_CLOCK_USER,
];
const sessions = new Map();
const memberRoute = /^\/v1\/workspaces\/[^/]+\/(members|invitations)(?:\/|$)/;
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
          account === RECOVERY_USER || account === E2E_USER
            ? []
            : [
                workspace(
                  "Casa",
                  "COP",
                  account === MEMBERS_USER ? "family" : "personal",
                ),
                workspace("Oficina"),
              ],
        omitMembershipDate: account === NO_DRAFT_CLOCK_USER,
        membershipDate:
          account === DRAFT_CLOCK_USER ? "Fri, 20 Nov 2026 12:00:00 GMT" : null,
        replays: new Map(),
        accounts: new Map(),
        openings: new Map(),
        ledger: new Map(),
        rates: new Map(),
        budgets: new Map(),
        funds: new Map(),
        debts: new Map(),
        scenarios: new Map(),
        dataJobs: new Map(),
        capabilities: new Map(),
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
    case "POST /v1/cli/device/approve": {
      if (!session?.onboarded) return unauthorized();
      const { userCode } = await readJson(request);
      return userCode === "ABCDEFGH"
        ? reply.writeHead(204).end()
        : json(400, { title: "The user code is invalid or expired." });
    }
    case "GET /v1/workspaces":
      if (!session) return unauthorized();
      if (session.omitMembershipDate) reply.sendDate = false;
      return json(
        200,
        {
          items: session.workspaces,
          pageInfo: { hasNextPage: false, nextCursor: null },
        },
        session.membershipDate ? { date: session.membershipDate } : undefined,
      );
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
    case "GET /v1/recurring-rules":
    case "GET /v1/subscriptions": {
      if (!session) return unauthorized();
      const space = session.workspaces.find(
        ({ id }) => id === request.headers["x-workspace-id"],
      );
      if (!space) return json(403, {});
      const recurring = route.endsWith("recurring-rules");
      if (!recurring && url.searchParams.get("status") !== "detected")
        return json(400, {});
      const item = recurring
        ? {
            id: space.id,
            name: "Internet de Casa",
            active: true,
            nextOccurrenceAt: "2099-01-01T02:00:00Z",
            behavior: "remind",
            frequency: "monthly",
          }
        : {
            id: space.id,
            payeeName: "Música de Casa",
            status: "detected",
            currentAmount: {
              amountMinor: "12345",
              currency: space.baseCurrency,
            },
            frequency: "monthly",
          };
      return json(200, {
        items: space.name === "Casa" ? [item] : [],
        pageInfo: { hasNextPage: false },
      });
    }
    case "GET /v1/analytics/advanced":
    case "GET /v1/analytics/cash-flow":
    case "GET /v1/analytics/summary": {
      if (!session) return unauthorized();
      const space = session.workspaces.find(
        ({ id }) => id === request.headers["x-workspace-id"],
      );
      if (!space) return json(403, {});
      const periodStart = url.searchParams.get("from");
      const periodEnd = url.searchParams.get("to");
      if (!periodStart || !periodEnd) return json(400, {});
      const money = (amountMinor) => ({
        currency: space.baseCurrency,
        amountMinor,
      });
      if (route.endsWith("advanced")) {
        if (url.searchParams.get("metric") !== "balance_projection")
          return json(400, {});
        return json(200, {
          metric: "balance_projection",
          generatedAt: new Date().toISOString(),
          data: {
            basisMonths: 2,
            openingBalanceMinor: "10000",
            months: [
              {
                month: `${periodStart.slice(0, 7)}-01`,
                projectedBalanceMinor: "-9901",
              },
            ],
          },
        });
      }
      if (route.endsWith("cash-flow")) {
        if (url.searchParams.get("granularity") !== "month")
          return json(400, {});
        return json(200, {
          series: [
            {
              period: `${periodStart.slice(0, 7)}-01`,
              value: money("227655"),
              secondaryValue: money("227655"),
            },
          ],
          categories:
            space.name === "Casa"
              ? [
                  {
                    categoryId: space.id,
                    categoryName: "Alimentación",
                    amount: money("12345"),
                    percentage: 100,
                  },
                ]
              : [],
        });
      }
      return json(200, {
        periodStart,
        periodEnd,
        baseCurrency: space.baseCurrency,
        netWorth: money(space.name === "Casa" ? "900719925474099301" : "0"),
        income: money("240000"),
        expenses: money("12345"),
        savingsCapacity: money("227655"),
        budgetUtilizationPercent: 87.25,
      });
    }
    default:
      if (
        /^\/v1\/(?:import-jobs|receipts|report-definitions|report-runs|export-jobs|backup-jobs)(?:\/|$)/.test(
          url.pathname,
        )
      ) {
        if (!session) return unauthorized();
        const space = session.workspaces.find(
          ({ id }) => id === request.headers["x-workspace-id"],
        );
        return space
          ? handleDataJobs({
              request,
              url,
              json,
              session,
              space,
              readJson,
              activeAccounts: () =>
                accountsFor(session, space, new Date().toISOString()),
              ledger: () => ledgerFor(session, space),
            })
          : json(403, {});
      }
      if (
        /^(?:GET \/v1\/scenarios|POST \/v1\/scenarios(?:\/[^/]+\/runs)?)$/.test(
          route,
        )
      ) {
        if (!session) return unauthorized();
        const space = session.workspaces.find(
          ({ id }) => id === request.headers["x-workspace-id"],
        );
        return space
          ? handleScenarios({ request, url, json, session, space, readJson })
          : json(403, {});
      }
      if (url.pathname.startsWith("/v1/accounts")) {
        if (!session) return unauthorized();
        return handleAccounts(request, url, session, json);
      }
      if (
        /^(?:GET \/v1\/(?:transactions(?:\/[^/]+)?|categories|payees|tags)|POST \/v1\/transactions(?:\/[^/]+\/void)?|PATCH \/v1\/transactions\/[^/]+)$/.test(
          route,
        )
      ) {
        if (!session) return unauthorized();
        const space = session.workspaces.find(
          ({ id }) => id === request.headers["x-workspace-id"],
        );
        return space
          ? handleLedger(session, space, request, url, json)
          : json(403, {});
      }
      if (
        route === "POST /v1/transfers" ||
        route === "POST /v1/currency-exchanges"
      ) {
        if (!session) return unauthorized();
        const space = session.workspaces.find(
          ({ id }) => id === request.headers["x-workspace-id"],
        );
        return space
          ? handleMovement(request, session, space, url.pathname, json)
          : json(403, {});
      }
      if (
        route === "GET /v1/exchange-rates" ||
        route === "POST /v1/exchange-rates"
      ) {
        if (!session) return unauthorized();
        const space = session.workspaces.find(
          ({ id }) => id === request.headers["x-workspace-id"],
        );
        return space
          ? handleRates(request, session, space, url, json)
          : json(403, {});
      }
      if (/^\/v1\/budgets(?:\/|$)/.test(url.pathname)) {
        if (!session) return unauthorized();
        const space = session.workspaces.find(
          ({ id }) => id === request.headers["x-workspace-id"],
        );
        return space
          ? handleBudgets({
              request,
              url,
              json,
              session,
              space,
              readJson,
              categoryId: ledgerFor(session, space).categories[0].id,
            })
          : json(403, {});
      }
      if (
        /^(?:GET \/v1\/funds(?:\/[^/]+)?|POST \/v1\/funds(?:\/[^/]+\/contributions)?)$/.test(
          route,
        )
      ) {
        if (!session) return unauthorized();
        const space = session.workspaces.find(
          ({ id }) => id === request.headers["x-workspace-id"],
        );
        return space
          ? handleFunds({
              request,
              url,
              json,
              session,
              space,
              readJson,
              accounts: () =>
                accountsFor(session, space, new Date().toISOString()),
            })
          : json(403, {});
      }
      if (
        /^(?:GET \/v1\/debts(?:\/[^/]+\/projection)?|POST \/v1\/debts\/[^/]+\/payments)$/.test(
          route,
        )
      ) {
        if (!session) return unauthorized();
        const space = session.workspaces.find(
          ({ id }) => id === request.headers["x-workspace-id"],
        );
        return space
          ? handleDebts({
              request,
              url,
              json,
              session,
              space,
              readJson,
              accounts: () =>
                accountsFor(session, space, new Date().toISOString()),
            })
          : json(403, {});
      }
      if (memberRoute.test(url.pathname)) {
        if (!session) return unauthorized();
        return handleMembers({
          request,
          url,
          reply,
          json,
          session,
          readJson,
        });
      }
      if (/^\/v1\/mcp\/grants(?:\/|$)/.test(url.pathname)) {
        if (!session) return unauthorized();
        return handleMcpGrants({
          request,
          url,
          reply,
          json,
          session,
          readJson,
        });
      }
      if (/^\/v1\/(?:approvals|ai)(?:\/|$)/.test(url.pathname)) {
        if (!session) return unauthorized();
        const space = session.workspaces.find(
          ({ id }) => id === request.headers["x-workspace-id"],
        );
        return handleCapabilities({
          request,
          url,
          json,
          session,
          space,
          readJson,
        });
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
    if (fields.informalDebt !== undefined) {
      const { counterpartyName, direction } = fields.informalDebt ?? {};
      if (
        fields.type !== "informal_debt" ||
        typeof counterpartyName !== "string" ||
        !counterpartyName.trim() ||
        [...counterpartyName.trim()].length > 120 ||
        !["i_owe", "owed_to_me"].includes(direction)
      )
        return json(422, {});
    }
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

function ledgerFor(session, space, now = new Date().toISOString()) {
  const accounts = accountsFor(session, space, now);
  const [account] = accounts;
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
  return session.ledger.get(space.id);
}

async function handleLedger(session, space, request, url, json) {
  const now = new Date().toISOString();
  const ledger = ledgerFor(session, space, now);
  const [, , resource, id, operation] = url.pathname.split("/");
  const index = ledger.transactions.findIndex((entry) => entry.id === id);
  const row = ledger.transactions[index];
  const etag = (entry) => ({ etag: `"${entry.version}"` });
  if (request.method !== "GET") {
    const key = request.headers["idempotency-key"];
    if (!uuid.test(key)) return json(400, {});
    const body = await readJson(request);
    const replayKey = `ledger:${space.id}:${request.method}:${url.pathname}:${key}`;
    const draft = JSON.stringify(body);
    const previous = session.replays.get(replayKey);
    if (previous)
      return previous.draft === draft
        ? json(previous.status, previous.created)
        : json(409, {});
    let created;
    if (id) {
      if (!row) return json(404, {});
      if (request.headers["if-match"] !== etag(row).etag) return json(412, {});
      if (
        ["voided", "reconciled"].includes(row.status) ||
        (operation === "void" && row.status === "draft")
      )
        return json(409, {});
      if (
        operation === "void" &&
        (typeof body.reason !== "string" || body.reason.length < 3)
      )
        return json(422, {});
      created = {
        ...row,
        ...(operation === "void" ? { status: "voided" } : body),
        version: row.version + 1,
        updatedAt: now,
      };
      ledger.transactions[index] = created;
    } else {
      const source = accountsFor(session, space, now).find(
        (candidate) => candidate.id === body.accountId,
      );
      if (
        !source ||
        source.status !== "active" ||
        body.amount?.currency !== source.currency ||
        !/^-?\d+$/.test(body.amount.amountMinor)
      )
        return json(422, {});
      created = {
        ...body,
        id: randomUUID(),
        status: "confirmed",
        version: 1,
        createdAt: now,
        updatedAt: now,
      };
      ledger.transactions.unshift(created);
      if (session.membershipDate)
        session.membershipDate = "Sat, 21 Nov 2026 12:00:00 GMT";
    }
    const status = id ? 200 : 201;
    session.replays.set(replayKey, { draft, status, created });
    return json(
      status,
      created,
      operation === "void" ? undefined : etag(created),
    );
  }
  if (id) return row ? json(200, row, etag(row)) : json(404, {});
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
        row.description?.toLowerCase().includes(get("query").toLowerCase())),
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

async function handleMovement(request, session, space, path, json) {
  const accounts = accountsFor(session, space, new Date().toISOString());
  const key = request.headers["idempotency-key"];
  if (!uuid.test(key)) return json(400, {});
  const body = await readJson(request);
  const origin = accounts.find(({ id }) => id === body.sourceAccountId);
  const target = accounts.find(({ id }) => id === body.destinationAccountId);
  const cross = path === "/v1/currency-exchanges";
  if (
    !origin ||
    !target ||
    origin === target ||
    cross !== (origin.currency !== target.currency) ||
    (cross
      ? body.sourceAmount?.currency !== origin.currency ||
        body.destinationAmount?.currency !== target.currency ||
        !body.executedRate
      : body.amount?.currency !== origin.currency) ||
    (body.fee && body.fee.currency !== origin.currency)
  )
    return json(422, {});
  const replay = `${space.id}:${path}:${key}`;
  const draft = JSON.stringify(body);
  const prior = session.replays.get(replay);
  if (prior)
    return prior.draft === draft ? json(201, prior.created) : json(409, {});
  const created = { ...body, id: randomUUID() };
  session.replays.set(replay, { draft, created });
  return json(201, created);
}

async function handleRates(request, session, space, url, json) {
  if (!session.rates.has(space.id))
    session.rates.set(
      space.id,
      space.name === "Casa"
        ? [
            {
              id: randomUUID(),
              baseCurrency: "USD",
              quoteCurrency: "COP",
              rate: "4111.005",
              effectiveAt: "2026-11-15T12:00:00Z",
              source: "frankfurter",
              manual: false,
              isStale: true,
              ageHours: 121.5,
            },
          ]
        : [],
    );
  const rows = session.rates.get(space.id);
  if (request.method === "GET") {
    const get = (field) => url.searchParams.get(field);
    return json(
      200,
      rows.filter(
        (row) =>
          ["baseCurrency", "quoteCurrency"].every(
            (key) => !get(key) || get(key) === row[key],
          ) &&
          (!get("from") || row.effectiveAt.slice(0, 10) >= get("from")) &&
          (!get("to") || row.effectiveAt.slice(0, 10) <= get("to")),
      ),
    );
  }
  const key = request.headers["idempotency-key"];
  if (!uuid.test(key)) return json(400, {});
  const { baseCurrency, quoteCurrency, rate, effectiveAt } =
    await readJson(request);
  const draft = JSON.stringify({
    baseCurrency,
    quoteCurrency,
    rate,
    effectiveAt,
  });
  const replay = `rates:${space.id}:${key}`;
  const prior = session.replays.get(replay);
  if (prior)
    return prior.draft === draft ? json(201, prior.created) : json(409, {});
  if (
    rows.some(
      (row) =>
        row.baseCurrency === baseCurrency &&
        row.quoteCurrency === quoteCurrency &&
        row.effectiveAt === effectiveAt,
    )
  )
    return json(409, {});
  const created = {
    id: randomUUID(),
    baseCurrency,
    quoteCurrency,
    rate,
    effectiveAt,
    source: "manual",
    manual: true,
    isStale: false,
    ageHours: 0,
  };
  rows.unshift(created);
  session.replays.set(replay, { draft, created });
  return json(201, created);
}

createServer((request, reply) => {
  void handle(request, reply).catch(() => {
    reply.writeHead(400).end();
  });
}).listen(4010, "127.0.0.1");
