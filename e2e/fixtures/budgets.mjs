import { randomUUID } from "node:crypto";

const encode = (value) =>
  Buffer.from(JSON.stringify(value)).toString("base64url");
const etag = (budget) => ({ etag: `"${budget.version}"` });

export async function handleBudgets({
  request,
  url,
  json,
  session,
  space,
  categoryId,
  readJson,
}) {
  const money = (amountMinor) => ({
    amountMinor,
    currency: space.baseCurrency,
  });
  if (!session.budgets.has(space.id)) {
    session.budgets.set(
      space.id,
      space.name === "Casa"
        ? [
            ["Enero", "01", "31"],
            ["Febrero", "02", "28"],
          ].map(([name, month, end]) => ({
            id: randomUUID(),
            name,
            method: "cash_flow",
            periodStart: `2026-${month}-01`,
            periodEnd: `2026-${month}-${end}`,
            currency: space.baseCurrency,
            version: 1,
            allocations: [
              {
                categoryId,
                planned: money("100000"),
                actual: money("50000"),
                available: money("50000"),
                rolloverPolicy: "none",
              },
            ],
          }))
        : [],
    );
  }
  const rows = session.budgets.get(space.id);
  const [, , , id, operation] = url.pathname.split("/");
  const indexOfBudget = rows.findIndex((row) => row.id === id);
  const budget = rows[indexOfBudget];
  if (request.method !== "GET") {
    const key = request.headers["idempotency-key"];
    if (!/^[a-f0-9-]{36}$/.test(key)) return json(400, {});
    const body = await readJson(request);
    const match = request.headers["if-match"];
    const fingerprint = JSON.stringify([match, body]);
    const replayKey = `budgets:${space.id}:${request.method}:${url.pathname}:${key}`;
    const replay = session.replays.get(replayKey);
    if (replay)
      return replay.fingerprint === fingerprint
        ? json(replay.status, replay.updated, etag(replay.updated))
        : json(409, {});
    let updated,
      status = 200;
    if (request.method === "POST" && !id) {
      const { name, method, periodStart, periodEnd, copyFromBudgetId } = body;
      const source = rows.find((row) => row.id === copyFromBudgetId);
      if (copyFromBudgetId && !source) return json(422, {});
      const allocations =
        source?.allocations.map((row) => ({
          ...row,
          actual: money("0"),
          available: row.planned,
        })) ?? [];
      updated = {
        id: randomUUID(),
        name,
        method,
        periodStart,
        periodEnd,
        version: 1,
        currency: space.baseCurrency,
        allocations,
      };
      rows.push(updated);
      status = 201;
    } else {
      if (!budget) return json(404, {});
      if (match !== etag(budget).etag) return json(412, {});
      updated = { ...budget, version: budget.version + 1 };
      if (request.method === "PATCH" && !operation) {
        updated.name = body.name;
        updated.method = body.method;
      } else if (request.method === "PUT" && operation === "allocations") {
        if (
          body.allocations.some(
            (row) =>
              row.categoryId !== categoryId ||
              row.planned.currency !== budget.currency,
          )
        )
          return json(422, {});
        updated.allocations = body.allocations.map((row) => {
          const actual =
            budget.allocations.find(
              (line) => line.categoryId === row.categoryId,
            )?.actual ?? money("0");
          return {
            ...row,
            actual,
            available: money(
              String(
                BigInt(row.planned.amountMinor) - BigInt(actual.amountMinor),
              ),
            ),
          };
        });
      } else return json(404, {});
      rows[indexOfBudget] = updated;
    }
    session.replays.set(replayKey, { fingerprint, status, updated });
    return json(status, updated, etag(updated));
  }
  if (id) return budget ? json(200, budget, etag(budget)) : json(404, {});
  const [from, to, rawCursor, rawLimit] = ["from", "to", "cursor", "limit"].map(
    (key) => url.searchParams.get(key),
  );
  const window = rows.filter(
    (row) => (!from || row.periodStart >= from) && (!to || row.periodEnd <= to),
  );
  const cursor = (row) =>
    encode([
      space.id,
      `${row.periodStart}T00:00:00.000000Z`,
      row.id,
      JSON.stringify([from, to]),
    ]);
  const index = rawCursor
    ? window.findIndex((row) => cursor(row) === rawCursor)
    : -1;
  if (rawCursor && index === -1) return json(400, {});
  const limit = Number(rawLimit ?? 50),
    items = window.slice(index + 1, index + 1 + limit);
  const hasNextPage = window.length > index + 1 + limit;
  return json(200, {
    items,
    pageInfo: {
      hasNextPage,
      nextCursor: hasNextPage ? cursor(items.at(-1)) : null,
    },
  });
}
