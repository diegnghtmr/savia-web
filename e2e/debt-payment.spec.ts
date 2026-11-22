import { expect, type Page } from "@playwright/test";
import { signInAs } from "./auth-helpers";
import { ONBOARDED_USER } from "./fixtures/accounts.mjs";
import { test } from "./fixtures/browser";

const cases = [
  {
    title: "unchanged split",
    first: ["2,00", "0,90", "0,10"],
    retry: ["2,00", "0,90", "0,10"],
    balance: "COP 88,01",
  },
  {
    title: "blank split retried with explicit full principal",
    first: ["", "", ""],
    retry: ["3,00", "", ""],
    balance: "COP 87,01",
  },
  {
    title: "omitted fee retried as explicit zero",
    first: ["2,00", "1,00", ""],
    retry: ["2,00", "1,00", "0"],
    balance: "COP 88,01",
  },
];

for (const { title, first, retry, balance } of cases) {
  test(`reopening a lost debt payment reply with ${title} does not apply principal twice`, async ({
    page,
    context,
  }) => {
    await signInAs(page, ONBOARDED_USER.email, ONBOARDED_USER.password);
    await page.goto("/debts");
    await page.getByRole("link", { name: "Estudios" }).click();
    const link = page.getByRole("link", { name: "Registrar pago" });
    await expect(link).toBeVisible({ timeout: 3000 });
    const detail = page.url();
    const href = (await link.getAttribute("href"))!;
    await link.click();
    const fill = async (tab: Page, [principal, interest, fee]: string[]) => {
      await tab.getByLabel("Cuenta de origen").selectOption({ label: "Caja" });
      await tab.getByLabel("Total (COP)").fill("3,00");
      await tab.getByLabel("Capital (opcional)").fill(principal);
      await tab.getByLabel("Interés (opcional)").fill(interest);
      await tab.getByLabel("Comisión (opcional)").fill(fee);
      await tab.getByLabel("Fecha").fill("2026-02-01");
    };
    await fill(page, first);
    const lost = Promise.withResolvers<void>();
    await page.route(new URL(href, page.url()).href, async (route) => {
      if (
        route.request().method() !== "POST" ||
        !route.request().postData()?.includes("draftPrepared")
      )
        return route.continue();
      try {
        expect((await route.fetch({ maxRedirects: 0 })).ok()).toBe(true);
        await route.abort();
        lost.resolve();
      } catch (error) {
        lost.reject(error);
      }
    });
    await page.getByRole("button", { name: "Registrar pago" }).click();
    await lost.promise;
    await page.close();
    const restored = await context.newPage();
    await restored.goto(detail);
    await expect(restored.getByText(balance, { exact: true })).toBeVisible();
    await restored.goto(href);
    await fill(restored, retry);
    await restored.getByRole("button", { name: "Registrar pago" }).click();
    await restored.getByRole("link", { name: "Ver deuda" }).click();
    await expect(
      restored.getByRole("heading", { name: "Estudios" }),
    ).toBeVisible();
    await expect(restored.getByText(balance, { exact: true })).toBeVisible();
  });
}
