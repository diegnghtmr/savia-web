import { expect } from "@playwright/test";
import { signInAs } from "./auth-helpers";
import { ONBOARDED_USER } from "./fixtures/accounts.mjs";
import { test } from "./fixtures/browser";

test("persists a workspace selection across reloads in an HTTP-only cookie", async ({
  page,
  context,
}) => {
  await signInAs(page, ONBOARDED_USER.email, ONBOARDED_USER.password);
  await expect(page.getByRole("heading", { name: "Casa" })).toBeVisible();

  const selector = page.getByRole("combobox", { name: "Espacio activo" });
  await selector.selectOption({ label: "Oficina" });
  await page.getByRole("button", { name: "Cambiar de espacio" }).click();
  await expect(page.getByRole("heading", { name: "Oficina" })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", { name: "Oficina" })).toBeVisible();
  const selected = await selector.inputValue();
  const cookie = (await context.cookies()).find(
    ({ name }) => name === "savia-workspace",
  );
  expect(cookie).toMatchObject({
    value: selected,
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/",
  });
  expect(await page.evaluate(() => document.cookie)).not.toContain(
    "savia-workspace",
  );
});
