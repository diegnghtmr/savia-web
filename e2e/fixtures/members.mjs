import { randomUUID } from "node:crypto";

const now = () => new Date().toISOString();
const page = (items) => ({ items, pageInfo: { hasNextPage: false } });

export async function handleMembers({
  request,
  url,
  reply,
  json,
  session,
  readJson,
}) {
  const [, , , workspaceId, resource, id] = url.pathname.split("/");
  const space = session.workspaces.find((item) => item.id === workspaceId);
  if (!space) return json(404, {});
  const state = (space.roster ??= {
    members: [
      member("Propietaria de Casa", "owner", session.user.id),
      ...(space.kind === "family"
        ? [member("Miembro de prueba", "viewer")]
        : []),
    ],
    invitations: [],
  });
  if (request.method === "GET") return json(200, page(state[resource]));
  if (space.kind !== "family") return json(422, {});
  if (!request.headers["idempotency-key"]) return json(400, {});
  if (resource === "invitations" && request.method === "POST") {
    const draft = await readJson(request);
    const row = {
      ...draft,
      id: randomUUID(),
      status: "pending",
      createdAt: now(),
      expiresAt: "2099-01-01T00:00:00.000Z",
    };
    state.invitations.push(row);
    return json(201, row);
  }
  const target = state.members.find((item) => item.id === id);
  if (!target) return json(404, {});
  const patch = request.method === "PATCH" ? await readJson(request) : null;
  if (target.role === "owner" && patch?.role !== "owner") {
    return json(409, {
      type: "https://savia.app/problems/last-owner-required",
    });
  }
  if (patch) {
    target.role = patch.role;
    return json(200, target);
  }
  if (request.method !== "DELETE") return json(404, {});
  state.members = state.members.filter((item) => item.id !== id);
  return reply.writeHead(204).end();
}

function member(displayName, role, userId = randomUUID()) {
  return {
    id: randomUUID(),
    displayName,
    role,
    userId,
    status: "active",
    joinedAt: now(),
  };
}
