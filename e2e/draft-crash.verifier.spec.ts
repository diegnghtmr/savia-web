// Reviewer e2e regression (verify mwr43ulr). Copy to e2e/.
import { expect, type Page } from "@playwright/test";
import { signInAs } from "./auth-helpers";
import { ONBOARDED_USER } from "./fixtures/accounts.mjs";
import { test, waitForDraftForm } from "./fixtures/browser";

async function fillDraft(page: Page) {
  await page.goto("/transactions/new", { waitUntil: "domcontentloaded" });
  await waitForDraftForm(page, "Crear transacción");
  await page.getByLabel("Tipo").selectOption("expense");
  await page
    .getByLabel("Cuenta", { exact: true })
    .selectOption({ label: "Caja (COP)" });
  await page.getByLabel("Importe").fill("41,20");
  await page.getByLabel("Fecha (UTC)").fill("2026-01-12");
  await page
    .getByLabel("Descripción")
    .fill("Compra sin confirmación de recibo");
}

test("a stopped browser before receipt acknowledgment cannot duplicate the create", async ({
  page,
  context,
}) => {
  await signInAs(page, ONBOARDED_USER.email, ONBOARDED_USER.password);
  await fillDraft(page);
  const seed = async () =>
    (await context.cookies()).find(({ name }) => name === "savia-draft-seed");
  expect(await seed()).toBeUndefined();

  const ack = Promise.withResolvers<void>();
  await page.route(/\/transactions\/[0-9a-f-]{36}$/, async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    await route.abort();
    ack.resolve();
  });
  await page.getByRole("button", { name: "Crear transacción" }).click();
  const heading = "Compra sin confirmación de recibo";
  await expect(page.getByRole("heading", { name: heading })).toBeVisible();
  const original = page.url();
  await ack.promise;

  // Admission now happens in verified preflight, not when the form mounts.
  expect(await seed()).toMatchObject({
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/",
  });
  expect(await page.evaluate(() => document.cookie)).not.toContain(
    "savia-draft-",
  );
  expect(
    (await context.cookies())
      .filter(({ name }) => name.startsWith("savia-draft-"))
      .every(({ httpOnly }) => httpOnly),
  ).toBe(true);

  const restored = await context.newPage();
  await page.close();
  await fillDraft(restored);
  await restored.getByRole("button", { name: "Crear transacción" }).click();
  await expect(restored).toHaveURL(original);
  await restored.goto(
    `/transactions?${new URLSearchParams({ query: heading })}`,
  );
  await expect(restored.getByRole("link", { name: heading })).toHaveCount(1);
  await expect(restored.getByRole("link", { name: "Siguiente" })).toHaveCount(
    0,
  );
});
