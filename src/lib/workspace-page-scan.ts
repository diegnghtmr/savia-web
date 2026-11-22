import "server-only";

const pageBudget = 20;
const deadlineMs = 5000;

export async function scanWorkspacePages<T extends { id: string }>(
  id: string,
  list: (
    query: URLSearchParams,
    signal: AbortSignal,
  ) => Promise<
    { items: T[]; cursor: string | null } | "invalid-filters" | null
  >,
) {
  const controller = new AbortController();
  const query = new URLSearchParams({ limit: "200" });
  const seen = new Set<string>();
  const { promise, resolve } = Promise.withResolvers<null>();
  const expires = performance.now() + deadlineMs;
  const timeout = () => {
    controller.abort();
    resolve(null);
  };
  const timer = setTimeout(timeout, deadlineMs);
  const scan = async () => {
    for (
      let index = 0;
      index < pageBudget && !controller.signal.aborted;
      index++
    ) {
      if (performance.now() >= expires) return null;
      const page = await list(query, controller.signal);
      if (
        performance.now() >= expires ||
        controller.signal.aborted ||
        !page ||
        page === "invalid-filters"
      )
        return null;
      const match = page.items.find((row) => row.id === id);
      if (match) return match;
      if (!page.cursor) return "not-found" as const;
      if (seen.has(page.cursor)) return null;
      seen.add(page.cursor);
      query.set("cursor", page.cursor);
    }
    return null;
  };
  try {
    return await Promise.race([scan(), promise]);
  } finally {
    clearTimeout(timer);
  }
}
