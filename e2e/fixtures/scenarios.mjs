import { randomUUID } from "node:crypto";

export async function handleScenarios({
  request,
  url,
  json,
  session,
  space,
  readJson,
}) {
  const list = session.scenarios.get(space.id) ?? [];
  if (request.method === "GET") {
    return json(200, { items: list, pageInfo: { hasNextPage: false } });
  }
  const key = request.headers["idempotency-key"];
  if (typeof key !== "string" || !/^[\da-f-]{36}$/.test(key))
    return json(400, {});
  const scope = `${space.id}:${url.pathname}:${key}`;
  const replay = session.replays.get(scope);
  if (url.pathname === "/v1/scenarios") {
    const draft = await readJson(request);
    const assumption = draft.assumptions?.[0];
    if (
      !draft.name ||
      draft.assumptions?.length !== 1 ||
      assumption?.type !== "expense_change" ||
      typeof assumption.value?.amountMinor !== "string" ||
      !/^-?\d+$/.test(assumption.value.amountMinor)
    )
      return json(422, {});
    if (replay) return json(201, replay);
    const item = {
      ...draft,
      id: randomUUID(),
      createdAt: new Date().toISOString(),
    };
    session.scenarios.set(space.id, [item, ...list]);
    session.replays.set(scope, item);
    return json(201, item);
  }
  const scenarioId = url.pathname.split("/")[3];
  const scenario = list.find(({ id }) => id === scenarioId);
  if (!scenario) return json(404, {});
  if (replay) return json(200, replay);
  const adjustment = BigInt(scenario.assumptions[0].value.amountMinor);
  const figures = (income, expenses, netWorth) => ({
    periodStart: "2026-01-01",
    periodEnd: "2026-02-28",
    baseCurrency: space.baseCurrency,
    monthlyIncomeMinor: income.toString(),
    monthlyExpensesMinor: expenses.toString(),
    monthlySavingsCapacityMinor: (income - expenses).toString(),
    netWorthMinor: netWorth.toString(),
  });
  const result = {
    id: randomUUID(),
    scenarioId,
    status: "completed",
    baseline: figures(200000n, 100000n, 300000n),
    projected: figures(200000n, 100000n + adjustment, 300000n),
    difference: figures(0n, adjustment, 0n),
  };
  session.replays.set(scope, result);
  return json(200, result);
}
