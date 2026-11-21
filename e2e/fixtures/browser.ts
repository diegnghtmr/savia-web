import { expect, test as base } from "@playwright/test";

export const test = base.extend<{ loopbackOnly: void }>({
  loopbackOnly: [
    async ({ context, baseURL }, use) => {
      const appOrigin = new URL(baseURL ?? "").origin;
      const blocked: string[] = [];
      await context.route("**/*", async (route) => {
        const url = new URL(route.request().url());
        if (url.origin === appOrigin) return route.continue();
        blocked.push(url.origin);
        await route.abort();
      });
      await use();
      expect(blocked, "browser requests outside the Next.js origin").toEqual(
        [],
      );
    },
    { auto: true },
  ],
});
