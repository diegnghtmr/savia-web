import { randomUUID } from "node:crypto";

const initialApproval = {
  id: "a0000000-0000-4000-8000-000000000001",
  toolName: "Registrar gasto",
  riskClass: "financial_write",
  argumentsHash: "initial-hash",
  preview: { description: "Propuesta original" },
  status: "pending",
  expiresAt: "2099-01-01T00:00:00Z",
};

export async function handleCapabilities({
  request,
  url,
  json,
  session,
  space,
  readJson,
}) {
  const [, , root, resource, action] = url.pathname.split("/");
  if (!space) return json(403, {});
  if (!session.capabilities.has(space.id)) {
    session.capabilities.set(space.id, {
      approval: { ...initialApproval },
      credentials: [],
    });
  }
  const state = session.capabilities.get(space.id);
  const proposal = state.approval;
  if (request.method === "GET") {
    if (root === "approvals") {
      if (resource)
        return resource === proposal.id ? json(200, proposal) : json(404, {});
      const items = proposal.status === "pending" ? [proposal] : [];
      return json(200, { items, pageInfo: { hasNextPage: false } });
    }
    if (resource === "providers")
      return json(200, [
        { providerId: "openai", enabled: true, credentialTypes: ["api_key"] },
      ]);
    if (resource === "credentials") return json(200, state.credentials);
  }
  const key = request.headers["idempotency-key"];
  const validKey = typeof key === "string" && /^[\da-f-]{36}$/.test(key);
  if (!validKey) return json(400, {});
  const body = await readJson(request);
  if (
    root === "approvals" &&
    resource === proposal.id &&
    body.argumentsHash === proposal.argumentsHash
  ) {
    if (action === "confirm" && proposal.argumentsHash === "initial-hash") {
      proposal.argumentsHash = "new-hash";
      proposal.preview = { description: "Propuesta actualizada" };
      return json(412, {});
    }
    if (action === "reject") {
      proposal.status = "rejected";
      return json(200, proposal);
    }
  }
  if (
    root === "ai" &&
    resource === "credentials" &&
    typeof body.secret === "string"
  ) {
    const row = {
      id: randomUUID(),
      version: 1,
      providerId: body.providerId,
      credentialType: "api_key",
      ownerType: "user",
      ownerSubjectId: session.user.id,
      status: "active",
      maskedIdentifier: `••••${body.secret.slice(-4)}`,
    };
    state.credentials.push(row);
    return json(201, row);
  }
  return json(404, {});
}
