# Savia Web

Savia Web is the browser app for Savia, a personal finance system in development. It serves the public home, handles registration and sign-in through Supabase Auth, and lets signed-in users set up a personal workspace. A Next.js Server Action sends the workspace request to the API using the user's session; the browser does not make that API call directly.

## Repositories

- [savia-backend](https://github.com/diegnghtmr/savia-backend) — HTTP API and background worker.
- [savia-mobile](https://github.com/diegnghtmr/savia-mobile) — Expo app shell.
- [savia-mcp](https://github.com/diegnghtmr/savia-mcp) — local MCP protocol server.

## Stack

- Node.js 24.18.0, pnpm 11.15.1, and TypeScript 6.0.3
- Next.js 16.2.11, React 19.2.8, and Tailwind CSS 4.1.18
- Supabase JavaScript client 2.110.9 and SSR helpers 0.12.3 (minimum versions in `package.json`)
- Vitest 4.1.10 and Playwright 1.61.1

## Run locally

Use the versions pinned in `mise.toml`. To use sign-in and onboarding, point the server at a Supabase Auth instance and a running Savia backend. Set `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `BACKEND_BASE_URL` in the server environment. Do not expose them as client-side variables. The web server defaults to port 3000; choose a different port for the backend if both run on the same host.

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

`pnpm test:e2e` uses Chromium and starts the previously built Next.js app. The authenticated checks need the local Supabase setup and a seeded test user; [the existing workflow](.github/workflows/ci.yml) shows that setup.

## Repository structure

- `src/app/` — public, sign-in, registration, and onboarding pages.
- `src/lib/` — server configuration, session, and HTTP gateways.
- `tests/` — Vitest tests for components, server code, and design rules.
- `e2e/` — Playwright browser tests.
- `supabase/` — local Supabase setup.

## License

MIT, see [LICENSE](LICENSE). The bundled Inter font is covered separately by its [SIL Open Font License](LICENSES/Inter-OFL-1.1.txt).
