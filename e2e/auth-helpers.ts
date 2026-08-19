import { type Page, expect } from "@playwright/test";

/**
 * Signs in as an existing user via the /sign-in route.
 *
 * Navigates to /sign-in, fills in credentials, submits the form,
 * and waits for the subsequent redirect away from the sign-in page.
 */
export async function signInAs(
  page: Page,
  email: string,
  password: string,
): Promise<void> {
  await page.goto("/sign-in", { waitUntil: "domcontentloaded" });
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(page).not.toHaveURL(/\/sign-in/);
}
