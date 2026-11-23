# Savia Web

## Browser tests

CI runs `pnpm build && pnpm test:e2e`. For local runs on a busy Linux machine, use:

```sh
pnpm build && pnpm test:e2e:isolated
```

The isolated runner requires `unshare` (util-linux), `ip` (iproute2), and permission to create unprivileged user and network namespaces. It brings up only loopback inside the new namespace; Playwright starts Next.js on port 3000 and the fixture service on port 4010 there. This keeps host bridge changes from interrupting Chromium while preserving normal browser asset delivery. The runner fails if isolation is unavailable; use `pnpm test:e2e` on a stable host or where namespaces are not supported.
