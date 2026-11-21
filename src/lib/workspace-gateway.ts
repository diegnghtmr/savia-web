import "server-only";

import { loadServerConfig } from "./server-config";

export const WORKSPACE_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface WorkspaceSummary {
  id: string;
  name: string;
}

type WorkspaceListResult =
  | { kind: "ok"; items: WorkspaceSummary[] }
  | { kind: "unauthenticated" }
  | { kind: "failed" };

interface WorkspacePorts {
  loadConfig: typeof loadServerConfig;
  fetchImpl: typeof fetch;
}

const productionPorts: WorkspacePorts = {
  loadConfig: loadServerConfig,
  fetchImpl: (input, init) => fetch(input, init),
};

export async function listWorkspaces(
  accessToken: string,
  ports: WorkspacePorts = productionPorts,
): Promise<WorkspaceListResult> {
  try {
    const url = workspaceEndpoint(ports);
    const items = new Map<string, WorkspaceSummary>();
    const cursors = new Set<string>();
    for (;;) {
      const response = await ports.fetchImpl(url.href, {
        method: "GET",
        cache: "no-store",
        headers: {
          authorization: `Bearer ${accessToken}`,
          accept: "application/json",
        },
      });
      if (response.status === 401) return { kind: "unauthenticated" };
      if (response.status !== 200) return { kind: "failed" };
      const body: unknown = await response.json();
      if (!body || typeof body !== "object") return { kind: "failed" };
      const { items: entries, pageInfo } = body as Record<string, unknown>;
      if (!Array.isArray(entries) || !pageInfo || typeof pageInfo !== "object")
        return { kind: "failed" };
      for (const entry of entries) {
        const id: unknown = entry?.id;
        const name: unknown = entry?.name;
        if (
          typeof id !== "string" ||
          !WORKSPACE_ID.test(id) ||
          typeof name !== "string" ||
          !name.trim()
        )
          return { kind: "failed" };
        items.set(id, { id, name });
      }
      const { hasNextPage, nextCursor } = pageInfo as Record<string, unknown>;
      if (hasNextPage === false)
        return { kind: "ok", items: [...items.values()] };
      if (
        hasNextPage !== true ||
        typeof nextCursor !== "string" ||
        !nextCursor ||
        cursors.has(nextCursor)
      )
        return { kind: "failed" };
      cursors.add(nextCursor);
      url.searchParams.set("cursor", nextCursor);
    }
  } catch {
    return { kind: "failed" };
  }
}

export async function createWorkspace(
  accessToken: string,
  draft: { name: string; baseCurrency: string },
  key: string,
  ports: WorkspacePorts = productionPorts,
): Promise<
  | { kind: "created"; id: string }
  | { kind: "unauthenticated" }
  | { kind: "failed" }
> {
  try {
    const response = await ports.fetchImpl(workspaceEndpoint(ports).href, {
      method: "POST",
      cache: "no-store",
      headers: {
        authorization: `Bearer ${accessToken}`,
        accept: "application/json",
        "content-type": "application/json",
        "idempotency-key": key,
      },
      body: JSON.stringify(draft),
    });
    if (response.status === 401) return { kind: "unauthenticated" };
    if (response.status === 201) {
      const id: unknown = (await response.json())?.id;
      if (typeof id === "string" && WORKSPACE_ID.test(id))
        return { kind: "created", id };
    }
  } catch {
    // The command may have reached the backend. Retrying uses the same key.
  }
  return { kind: "failed" };
}

function workspaceEndpoint(ports: WorkspacePorts) {
  const { backendBaseUrl } = ports.loadConfig();
  return new URL("v1/workspaces", backendBaseUrl.href.replace(/\/?$/, "/"));
}
