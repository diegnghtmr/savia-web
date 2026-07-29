// Vitest resolves `server-only` to this module. The real package throws on
// import outside a React Server Component, which would make every server
// module untestable. The marker's production guarantee is enforced by the
// bundler and by `scripts/audit-static.mjs`, not by this stub.
export {};
