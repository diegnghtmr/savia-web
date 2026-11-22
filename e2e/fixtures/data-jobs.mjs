import { randomUUID } from "node:crypto";

export async function handleDataJobs({
  request,
  url,
  json,
  session,
  space,
  readJson,
  activeAccounts,
  ledger,
}) {
  const [, , route, id, action] = url.pathname.split("/");
  if (route === "backup-jobs" && space.name === "Casa") return json(501, {});
  if (!session.dataJobs.has(space.id))
    session.dataJobs.set(space.id, new Map());
  const jobs = session.dataJobs.get(space.id);
  const item = jobs.get(id);
  if (request.method === "GET") {
    if (route === "report-definitions" && !id)
      return json(200, {
        items: [...jobs.values()]
          .filter((entry) => entry.route === route)
          .map((entry) => entry.body),
        pageInfo: { hasNextPage: false },
      });
    if (!item || item.route !== route) return json(404, {});
    if (item.reads++ > 0 && item.body.status === "processing") {
      item.body.status = route === "receipts" ? "awaiting_review" : "completed";
      if (route !== "receipts") {
        item.body.downloadUrl = `https://storage.example.test/${item.body.id}?signed=fixture`;
        item.body.expiresAt = new Date(Date.now() + 60000).toISOString();
      }
    }
    return json(200, item.body);
  }
  const key = request.headers["idempotency-key"];
  const validKey = typeof key === "string" && /^[\da-f-]{36}$/.test(key);
  if (!validKey) return json(400, {});
  const replayKey = `data:${space.id}:${url.pathname}:${key}`;
  const previous = session.replays.get(replayKey);
  if (previous) return json(previous.status, previous.body);
  function save(status, body) {
    session.replays.set(replayKey, { status, body });
    return json(status, body);
  }
  const newId = randomUUID();
  const now = new Date().toISOString();
  if (action) {
    if (!item || item.route !== route) return json(404, {});
    const body = await readJson(request);
    const accountId = body.transaction?.accountId ?? body.accountId;
    const account = activeAccounts().find((row) => row.id === accountId);
    if (account?.status !== "active") return json(422, {});
    if (route === "import-jobs" && action === "commit") {
      if (
        !body.skipDuplicateCandidates ||
        !body.columnMapping?.date ||
        item.body.status !== "awaiting_mapping"
      )
        return json(422, {});
      item.body.status = "completed";
      return save(202, { id: newId, status: "completed", createdAt: now });
    }
    if (
      route === "receipts" &&
      action === "confirm" &&
      item.body.status === "awaiting_review"
    ) {
      if (body.transaction.amount?.amountMinor !== "12345")
        return json(422, {});
      const transaction = {
        ...body.transaction,
        id: newId,
        status: "confirmed",
        version: 1,
        createdAt: now,
        updatedAt: now,
      };
      ledger().transactions.unshift(transaction);
      item.body.status = "confirmed";
      item.body.transactionId = newId;
      return save(201, transaction);
    }
    return json(409, {});
  }
  let body = { id: newId, createdAt: now };
  if (route === "import-jobs" || route === "receipts") {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const multipart = await new Response(Buffer.concat(chunks), {
      headers: { "content-type": request.headers["content-type"] },
    }).formData();
    const file = multipart.get("file");
    if (!(file instanceof File) || !file.size) return json(422, {});
    body.fileName = file.name;
    if (route === "import-jobs") {
      const format = multipart.get("formatHint");
      if (!["csv", "qif", "ofx"].includes(format)) return json(422, {});
      Object.assign(body, {
        status: "awaiting_mapping",
        detectedFormat: format,
        totalRows: 3,
        validRows: 1,
        duplicateRows: 1,
        errorRows: 1,
        sourceColumns: ["date", "amount", "description"],
      });
    } else {
      const preference = multipart.get("processingPreference");
      if (preference !== "savia") return json(422, {});
      const field = (value) => ({ value, confidence: 0.9 });
      Object.assign(body, {
        status: "processing",
        processingLocation: "savia",
        merchant: field("Tienda"),
        currency: field("COP"),
        date: field("2026-02-01"),
        total: field(123.45),
      });
    }
  } else if (route === "report-definitions") {
    body = { ...body, ...(await readJson(request)), version: 1, filters: {} };
  } else {
    const draft = route === "backup-jobs" ? {} : await readJson(request);
    if (
      route === "report-runs" &&
      jobs.get(draft.definitionId)?.route !== "report-definitions"
    )
      return json(422, {});
    body = {
      ...body,
      format: draft.format,
      status: "processing",
      downloadUrl: null,
      expiresAt: null,
    };
  }
  jobs.set(newId, { route, body, reads: 0 });
  return save(route === "report-definitions" ? 201 : 202, body);
}
