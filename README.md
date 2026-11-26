# Savia Web

Savia Web is the browser app for Savia, a personal finance system. It serves the public home page, handles registration and sign-in through Supabase Auth, and lets signed-in users set up a personal workspace. The workspace includes accounts, transactions, transfers, budgets, funds, debts, analytics, imports, receipts, and reports. Next.js talks to the Savia API on the server, using the signed-in user's session for workspace requests.

## Repositories

- [savia-backend](https://github.com/diegnghtmr/savia-backend) — HTTP API and background worker.
- [savia-mobile](https://github.com/diegnghtmr/savia-mobile) — Expo app for Android and iOS.
- [savia-mcp](https://github.com/diegnghtmr/savia-mcp) — local MCP protocol server.
- [savia-cli](https://github.com/diegnghtmr/savia-cli) — command-line client for Savia.

## Stack

- Node.js 24.18.0, pnpm 11.15.1, and TypeScript 6.0.3
- Next.js 16.2.11, React 19.2.8, and Tailwind CSS 4.1.18
- Supabase JavaScript client 2.110.9 and SSR helpers 0.12.3 (minimum versions in `package.json`)
- Vitest 4.1.10 and Playwright 1.61.1

## Run locally

Use the versions pinned in `mise.toml`. For sign-in, onboarding, and workspace features, point the server at Supabase Auth and a running Savia backend. Set `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `BACKEND_BASE_URL` in the server environment. Do not expose them as client-side variables. The web server defaults to port 3000; choose a different port for the backend if both run on the same host.

```sh
pnpm install --frozen-lockfile --strict-peer-dependencies
pnpm build
pnpm start
```

## Tests

```sh
pnpm test:unit
pnpm test:server
pnpm test:component
pnpm test:design
pnpm test:audit
```

## Browser tests

CI runs `pnpm build && pnpm test:e2e`. Playwright uses Chromium and starts the previously built Next.js app and local fixtures for Supabase Auth and the Savia API. For local runs on a busy Linux machine, use:

```sh
pnpm build && pnpm test:e2e:isolated
```

The isolated runner requires `unshare` (util-linux), `ip` (iproute2), and permission to create unprivileged user and network namespaces. It brings up only loopback inside the new namespace; Playwright starts Next.js on port 3000 and the fixture service on port 4010 there. This keeps host bridge changes from interrupting Chromium while preserving normal browser asset delivery. The runner fails if isolation is unavailable; use `pnpm test:e2e` on a stable host or where namespaces are not supported.

## Repository structure

- `src/app/` — public, authentication, onboarding, and workspace pages and their Server Actions.
- `src/lib/` — server configuration, session handling, and HTTP gateways.
- `tests/` — Vitest suites.
- `e2e/` — Playwright browser tests and local service fixtures.
- `supabase/` — local Supabase configuration.

## License

MIT, see [LICENSE](LICENSE). The bundled Inter font is covered separately by its [SIL Open Font License](LICENSES/Inter-OFL-1.1.txt).
