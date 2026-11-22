import { randomUUID } from "node:crypto";

const positive = (money, currency) =>
  money?.currency === currency && /^[1-9]\d*$/.test(money.amountMinor);

export async function handleFunds({
  request,
  url,
  json,
  session,
  space,
  readJson,
  accounts,
}) {
  const money = (amountMinor) => ({
    amountMinor,
    currency: space.baseCurrency,
  });
  if (!session.funds.has(space.id)) {
    session.funds.set(
      space.id,
      space.name === "Casa"
        ? ["Emergencias", "Viaje"].map((name) => ({
            id: randomUUID(),
            name,
            currency: space.baseCurrency,
            status: "active",
            targetAmount: money("100000"),
            currentAmount: money("25000"),
          }))
        : [],
    );
  }
  const rows = session.funds.get(space.id);
  if (request.method === "POST") {
    const key = request.headers["idempotency-key"];
    if (!/^[a-f0-9-]{36}$/.test(key) || request.headers["if-match"])
      return json(400, {});
    const body = await readJson(request);
    const fingerprint = JSON.stringify([url.pathname, body]);
    const replayKey = `funds:${space.id}:${key}`;
    const previous = session.replays.get(replayKey);
    if (previous)
      return previous.fingerprint === fingerprint
        ? json(201, previous.created)
        : json(409, {});
    const id = url.pathname.split("/")[3];
    let created;
    if (!id) {
      if (
        body.linkedAccountId &&
        !accounts().some((row) => row.id === body.linkedAccountId)
      )
        return json(422, {});
      if (!positive(body.targetAmount, body.currency)) return json(400, {});
      created = {
        ...body,
        id: randomUUID(),
        status: "active",
        currentAmount: { currency: body.currency, amountMinor: "0" },
      };
      rows.push(created);
    } else {
      const fund = rows.find((row) => row.id === id);
      if (!fund) return json(404, {});
      if (
        !positive(body.amount, fund.currency) ||
        !accounts().some(
          (row) =>
            row.id === body.accountId &&
            row.currency === fund.currency &&
            row.status !== "closed",
        )
      )
        return json(422, {});
      fund.currentAmount.amountMinor = String(
        BigInt(fund.currentAmount.amountMinor) +
          BigInt(body.amount.amountMinor),
      );
      created = { id: randomUUID(), type: "fund_contribution", ...body };
    }
    session.replays.set(replayKey, {
      fingerprint,
      created: structuredClone(created),
    });
    return json(201, created);
  }
  const cursor = (row) =>
    Buffer.from(
      JSON.stringify([space.id, "2026-01-01T00:00:00.000000Z", row.id]),
    ).toString("base64url");
  const rawCursor = url.searchParams.get("cursor");
  const index = rawCursor
    ? rows.findIndex((row) => cursor(row) === rawCursor)
    : -1;
  if (rawCursor && index === -1) return json(400, {});
  const limit = Number(url.searchParams.get("limit") ?? 50);
  const items = rows.slice(index + 1, index + 1 + limit);
  const hasNextPage = rows.length > index + 1 + limit;
  return json(200, {
    items,
    pageInfo: {
      hasNextPage,
      nextCursor: hasNextPage ? cursor(items.at(-1)) : null,
    },
  });
}
