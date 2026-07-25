import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";

const root = resolve(import.meta.dirname, "..");
const execFileAsync = promisify(execFile);

describe("the Savia visual contract", () => {
  it("uses the local Inter asset and semantic design tokens", async () => {
    const styles = await readFile(resolve(root, "src/app/globals.css"), "utf8");

    expect(styles).toContain("inter-latin-wght-normal.woff2");
    expect(styles).toContain("--savia-canvas");
    expect(styles).toContain("--savia-action");
  });

  it("verifies the local font bytes and license", async () => {
    const result = await execFileAsync(
      process.execPath,
      ["scripts/verify-font.mjs"],
      {
        cwd: root,
      },
    );

    expect(result.stdout).toContain("FONT_VERIFY PASS");
  });
});
