import { expect, test as base, type Page, type Route } from "@playwright/test";

const nextScript = /^\/_next\/static\/.*\.js$/;

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

async function servePublicScript(route: Route) {
  const request = route.request();
  if (request.method() !== "GET" || request.resourceType() !== "script")
    return route.fallback();
  // Fetch the real build asset without browser cookies, redirects or retries.
  // Chromium cancels even loopback HTTP requests on host network changes.
  const response = await fetch(request.url(), { redirect: "manual" });
  const headers = Object.fromEntries(response.headers);
  // Fetch has decoded the response; let fulfill frame the delivered bytes.
  delete headers["content-encoding"];
  delete headers["content-length"];
  delete headers["transfer-encoding"];
  await route.fulfill({
    status: response.status,
    headers,
    body: Buffer.from(await response.arrayBuffer()),
  });
}

export async function openEnhancedForm(
  page: Page,
  path: string,
  label: string,
) {
  const errors: string[] = [];
  const failedScripts: string[] = [];
  const inFlight = new Set<string>();
  const scriptPath = (url: string) => new URL(url).pathname;
  page.on("pageerror", (error) => {
    errors.push(error.message.split("\n")[0].slice(0, 240));
  });
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text().split("\n")[0].slice(0, 240));
    }
  });
  page.on("request", (request) => {
    if (request.resourceType() === "script") inFlight.add(request.url());
  });
  page.on("requestfinished", (request) => inFlight.delete(request.url()));
  page.on("requestfailed", (request) => {
    if (inFlight.delete(request.url())) {
      failedScripts.push(
        `${scriptPath(request.url())} ${request.failure()?.errorText}`,
      );
    }
  });
  page.on("response", (response) => {
    if (inFlight.has(response.url()) && response.status() >= 400) {
      failedScripts.push(
        `${scriptPath(response.url())} HTTP ${response.status()}`,
      );
    }
  });
  await page.addInitScript(
    ({ path, label }) => {
      if (location.pathname !== path) return;
      addEventListener("load", () => performance.mark("savia:load"), {
        once: true,
      });
      const observer = new MutationObserver(() => {
        const form = Array.from(document.forms).find(
          (form) => form.getAttribute("aria-label") === label,
        );
        if (form?.dataset.enhanced === "true") {
          performance.mark("savia:enhanced");
          observer.disconnect();
        }
      });
      observer.observe(document, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["data-enhanced"],
      });
    },
    { path, label },
  );
  const origin = new URL(page.url()).origin;
  const publicScript = (url: URL) =>
    url.origin === origin && nextScript.test(url.pathname);
  await page.route(publicScript, servePublicScript);
  const form = page.getByRole("form", { name: label });
  try {
    await page.goto(path);
    await expect(form).toHaveAttribute("data-enhanced", "true");
  } finally {
    await page.unroute(publicScript, servePublicScript);
    const timing = await page
      .evaluate(() => {
        const ms = (name: string) => {
          const mark = performance.getEntriesByName(name, "mark")[0];
          return mark ? Math.round(mark.startTime) : null;
        };
        const load = ms("savia:load");
        const enhanced = ms("savia:enhanced");
        const scripts = performance
          .getEntriesByType("resource")
          .filter((entry) => /\/_next\/static\/.*\.js$/.test(entry.name));
        const ends = scripts.map((entry) => entry.startTime + entry.duration);
        return {
          load,
          enhanced,
          loadToEnhanced:
            load === null || enhanced === null ? null : enhanced - load,
          observed: Math.round(performance.now()),
          scripts: scripts.length,
          lastScript: Math.round(Math.max(0, ...ends)),
        };
      })
      .catch(() => null);
    const report = {
      timing,
      errors,
      failedScripts,
      inFlight: [...inFlight].map(scriptPath),
    };
    console.log(`[hydration] ${path} ${JSON.stringify(report)}`);
  }
  return form;
}
