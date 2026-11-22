import { randomUUID } from "node:crypto";

const money = (amountMinor) => ({ amountMinor, currency: "COP" });
export async function handleDebts({
  request,
  url,
  json,
  session,
  space,
  readJson,
  accounts,
}) {
  if (!session.debts.has(space.id)) {
    session.debts.set(
      space.id,
      space.name === "Casa"
        ? ["Préstamo", "Estudios"].map((name) => ({
            id: randomUUID(),
            name,
            currency: "COP",
            annualRate: "0.125",
            rateType: "fixed",
            status: "active",
            principal: money("10000"),
            outstandingBalance: money("9001"),
            minimumPayment: money("1000"),
          }))
        : [],
    );
  }
  const rows = session.debts.get(space.id);
  const debt = rows.find((row) => row.id === url.pathname.split("/")[3]);
  if (request.method === "POST") {
    const key = request.headers["idempotency-key"];
    if (!/^[\da-f-]{36}$/.test(key)) return json(400, {});
    const body = await readJson(request);
    const {
      accountId,
      totalAmount,
      principalAmount,
      interestAmount,
      feeAmount,
      occurredAt,
    } = body;
    const fingerprint = JSON.stringify([url.pathname, body]);
    const replayKey = `debts:${space.id}:${key}`;
    const replay = session.replays.get(replayKey);
    if (replay)
      return replay.fingerprint === fingerprint
        ? json(201, replay.created)
        : json(409, {});
    if (!debt) return json(404, {});
    const parts = [principalAmount, interestAmount, feeAmount].filter(Boolean);
    if (
      !accounts().some(
        (row) =>
          row.id === accountId &&
          row.currency === debt.currency &&
          row.status !== "closed",
      ) ||
      ![totalAmount, ...parts].every(
        (item) =>
          item?.currency === debt.currency && /^\d+$/.test(item.amountMinor),
      ) ||
      BigInt(totalAmount.amountMinor) <= 0n ||
      (parts.length &&
        parts.reduce((sum, item) => sum + BigInt(item.amountMinor), 0n) !==
          BigInt(totalAmount.amountMinor))
    )
      return json(422, {});
    const principal = parts.length
      ? (principalAmount?.amountMinor ?? "0")
      : totalAmount.amountMinor;
    const remainder =
      BigInt(debt.outstandingBalance.amountMinor) - BigInt(principal);
    debt.outstandingBalance = money(remainder > 0n ? String(remainder) : "0");
    const created = {
      id: randomUUID(),
      type: "debt_payment",
      status: "confirmed",
      accountId,
      amount: money(`-${totalAmount.amountMinor}`),
      occurredAt,
    };
    session.replays.set(replayKey, { fingerprint, created });
    return json(201, created);
  }
  if (url.pathname.endsWith("/projection")) {
    if (!debt) return json(404, {});
    if (debt.name === "Estudios") return json(501, {});
    const balance = debt.outstandingBalance;
    const total = money(String(BigInt(balance.amountMinor) + 100n));
    return json(200, {
      debtId: debt.id,
      strategy: "minimum_payment",
      asOf: "2026-11-21",
      estimatedPayoffDate: "2027-01-01",
      startingBalance: balance,
      totalInterest: money("100"),
      totalCost: total,
      schedule: [
        {
          dueDate: "2027-01-01",
          paymentAmount: total,
          principalAmount: balance,
          interestAmount: money("100"),
          remainingBalance: money("0"),
        },
      ],
    });
  }
  const cursor = ({ id }) =>
    Buffer.from(
      JSON.stringify([space.id, "2026-01-01T00:00:00.000000Z", id]),
    ).toString("base64url");
  const requested = url.searchParams.get("cursor"),
    limit = Number(url.searchParams.get("limit") ?? 50);
  const start = requested
    ? rows.findIndex((row) => cursor(row) === requested) + 1
    : 0;
  if (requested && !start) return json(400, {});
  const items = rows.slice(start, start + limit),
    hasNextPage = start + limit < rows.length;
  return json(200, {
    items,
    pageInfo: {
      hasNextPage,
      nextCursor: hasNextPage ? cursor(items.at(-1)) : null,
    },
  });
}
