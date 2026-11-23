import { randomUUID } from "node:crypto";

export async function handleMcpGrants({
  request,
  url,
  reply,
  json,
  session,
  readJson,
}) {
  const grants = (session.grants ??= new Map());
  const id = url.pathname.split("/")[4];
  if (!id && request.method === "GET")
    return json(200, {
      items: [...grants.values()],
      pageInfo: { hasNextPage: false },
    });
  const key = request.headers["idempotency-key"];
  if (!key || request.headers["x-workspace-id"]) return json(400, {});
  const replay = session.replays.get(key);
  if (replay)
    return replay.grant ? json(201, replay.grant) : reply.writeHead(204).end();
  if (!id && request.method === "POST") {
    const draft = await readJson(request);
    if (
      !session.workspaces.some(
        (workspace) => workspace.id === draft.workspaceIds?.[0],
      )
    )
      return json(403, {});
    if (!Array.isArray(draft.schedule) || !Array.isArray(draft.toolAllowlist))
      return json(422, {});
    const grant = {
      ...draft,
      id: randomUUID(),
      status: "active",
      createdAt: new Date().toISOString(),
    };
    grants.set(grant.id, grant);
    session.replays.set(key, { grant });
    return json(201, grant);
  }
  if (id && request.method === "DELETE") {
    const grant = grants.get(id);
    if (!grant) return json(404, {});
    grant.status = "revoked";
    session.replays.set(key, { revoked: true });
    return reply.writeHead(204).end();
  }
  return json(404, {});
}
