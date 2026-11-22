import "server-only";

// A cookie alone can be replayed when the entire dispatch response is lost.
// These exceptional permits are valid only in the process that issued them.
// Another instance or a restart fails closed and asks for a new confirmation.
const shared = globalThis as typeof globalThis & {
  saviaOneShotDrafts?: Map<string, number>;
};
const permits = (shared.saviaOneShotDrafts ??= new Map());
const limit = 1024;
const lifetime = 60_000;

export function admitOneShotDraft(permit: string) {
  const now = performance.now();
  for (const [key, expires] of permits) {
    if (expires <= now) permits.delete(key);
  }
  if (permits.size >= limit) return false;
  permits.set(permit, now + lifetime);
  return true;
}

export function consumeOneShotDraft(permit: string) {
  const expires = permits.get(permit);
  permits.delete(permit);
  // This deadline bounds a capability, never a backend-key retry window.
  return expires !== undefined && performance.now() < expires;
}
