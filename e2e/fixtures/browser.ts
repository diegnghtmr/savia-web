import {
  expect,
  test as base,
  type Page,
  type Request,
} from "@playwright/test";

export const test = base.extend<{ loopbackOnly: void }>({
  loopbackOnly: [
    async ({ context, baseURL }, use, info) => {
      const appOrigin = new URL(baseURL ?? "").origin;
      const blocked: string[] = [];
      const pending = new Map<Request, { start: number; status?: number }>();
      const recent: object[] = [];
      const describe = (request: Request) => {
        const url = new URL(request.url());
        const state = pending.get(request);
        const failure = request.failure()?.errorText;
        return {
          method: request.method(),
          path: url.origin === appOrigin ? url.pathname : "(external)",
          type: request.resourceType(),
          rsc: url.searchParams.has("_rsc"),
          ms: state ? Math.round(performance.now() - state.start) : null,
          status: state?.status,
          failure: failure && (/^net::[A-Z_]+$/.test(failure) ? failure : true),
        };
      };
      const finish = (request: Request) => {
        recent.push(describe(request));
        if (recent.length > 24) recent.shift();
        pending.delete(request);
      };
      context.on("request", (request) => {
        pending.set(request, { start: performance.now() });
      });
      context.on("response", (response) => {
        const state = pending.get(response.request());
        if (state) state.status = response.status();
      });
      context.on("requestfinished", finish);
      context.on("requestfailed", finish);
      await context.route(
        (url) => url.origin !== appOrigin,
        async (route) => {
          blocked.push(new URL(route.request().url()).origin);
          await route.abort();
        },
      );
      await use();
      if (info.status !== info.expectedStatus) {
        const details = { pending: [...pending.keys()].map(describe), recent };
        console.log(`[browser requests] ${JSON.stringify(details)}`);
      }
      expect(blocked, "browser requests outside the Next.js origin").toEqual(
        [],
      );
    },
    { auto: true },
  ],
});

export async function waitForAccountForm(page: Page) {
  const form = page.getByRole("form", { name: "Crear cuenta" });
  await expect(form).toHaveAttribute("data-enhanced", "true");
}

export async function waitForDraftForm(page: Page, name: string) {
  await expect(page.getByRole("button", { name, exact: true })).toBeEnabled();
}

export async function openEnhancedForm(
  page: Page,
  path: string,
  label: string,
) {
  const form = page.getByRole("form", { name: label });
  await page.goto(path, { waitUntil: "domcontentloaded" });
  await expect(form).toHaveAttribute("data-enhanced", "true");
  return form;
}
