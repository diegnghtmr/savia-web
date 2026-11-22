import { expect } from "@playwright/test";
import { signInAs } from "./auth-helpers";
import { E2E_USER } from "./fixtures";
import { DRAFT_CLOCK_USER, NO_DRAFT_CLOCK_USER } from "./fixtures/accounts.mjs";
import { test } from "./fixtures/browser";

const seedName = "savia-draft-seed";
test("does not issue a draft seed on sign-in or onboarding redirects", async ({
  page,
  context,
}) => {
  await page.goto("/transactions/new");
  await expect(page).toHaveURL(/\/sign-in$/);
  expect(
    (await context.cookies()).find(({ name }) => name === seedName),
  ).toBeUndefined();
  await signInAs(page, E2E_USER.email, E2E_USER.password);
  await page.goto("/transfers");
  await expect(page).toHaveURL(/\/onboarding$/);
  expect(
    (await context.cookies()).find(({ name }) => name === seedName),
  ).toBeUndefined();
});

test("requires explicit confirmation when an old submission may have lost its entire response", async ({
  page,
  context,
}) => {
  await signInAs(page, DRAFT_CLOCK_USER.email, DRAFT_CLOCK_USER.password);
  const fill = async () => {
    await page.goto("/transactions/new", { waitUntil: "networkidle" });
    await page.getByLabel("Tipo").selectOption("expense");
    await page
      .getByLabel("Cuenta", { exact: true })
      .selectOption({ label: "Caja (COP)" });
    await page.getByLabel("Importe").fill("41,20");
    await page.getByLabel("Fecha (UTC)").fill("2026-01-12");
    await page.getByLabel("Descripción").fill("Compra por confirmar");
  };
  await fill();
  const dispatch = Promise.withResolvers<string>();
  await page.route("**/transactions/new", async (route) => {
    if (
      route.request().method() !== "POST" ||
      !route.request().postData()?.includes("draftPrepared")
    )
      return route.continue();
    try {
      const reply = await route.fetch({ maxRedirects: 0 });
      const redirect = reply.headers()["x-action-redirect"];
      expect(redirect).toMatch(/^\/transactions\/[\da-f-]+;/);
      await route.abort();
      dispatch.resolve(redirect.split(";")[0]);
    } catch (error) {
      dispatch.reject(error);
    }
  });
  await page.getByRole("button", { name: "Crear transacción" }).click();
  const original = await dispatch.promise;
  await page.unroute("**/transactions/new");
  await fill();
  await page.getByRole("button", { name: "Crear transacción" }).click();
  await expect(
    page.getByRole("form", { name: "Crear transacción" }).getByRole("alert"),
  ).toHaveText(
    "Puede que este movimiento ya se haya registrado. Revisa la lista antes de volver a intentarlo.",
  );
  await expect(page.getByLabel("Importe")).toHaveValue("41,20");
  const list = await context.newPage();
  await list.goto("/transactions?query=Compra+por+confirmar");
  await expect(
    list.getByRole("link", { name: "Compra por confirmar" }),
  ).toHaveAttribute("href", original);
  await expect(list.getByRole("link", { name: "Siguiente" })).toHaveCount(0);
  await page.getByRole("button", { name: "Registrar de todos modos" }).click();
  await expect(
    page.getByRole("heading", { name: "Compra por confirmar" }),
  ).toBeVisible();
  await expect(page).not.toHaveURL(new RegExp(`${original}$`));
  await list.reload();
  await expect(list.getByRole("link", { name: "Siguiente" })).toBeVisible();
});

test("records an explicitly confirmed transaction when membership has no Date", async ({
  page,
  context,
}) => {
  await signInAs(page, NO_DRAFT_CLOCK_USER.email, NO_DRAFT_CLOCK_USER.password);
  await page.goto("/transactions/new");
  await page.getByLabel("Tipo").selectOption("expense");
  await page
    .getByLabel("Cuenta", { exact: true })
    .selectOption({ label: "Caja (COP)" });
  await page.getByLabel("Importe").fill("1,01");
  await page.getByLabel("Fecha (UTC)").fill("2026-01-12");
  await page.getByLabel("Descripción").fill("Compra sin reloj");
  await page.getByRole("button", { name: "Crear transacción" }).click();
  await expect(
    page.getByRole("form", { name: "Crear transacción" }).getByRole("alert"),
  ).toHaveText(
    "Puede que este movimiento ya se haya registrado. Revisa la lista antes de volver a intentarlo.",
  );
  const ledger = await context.newPage();
  await ledger.goto("/transactions?query=Compra+sin+reloj");
  const recorded = ledger.getByRole("link", { name: "Compra sin reloj" });
  await expect(recorded).toHaveCount(0);
  await page.getByRole("button", { name: "Registrar de todos modos" }).click();
  await expect(
    page.getByRole("heading", { name: "Compra sin reloj" }),
  ).toBeVisible();
  await ledger.reload();
  await expect(recorded).toHaveCount(1);
});
