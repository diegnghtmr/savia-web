import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const root = resolve(import.meta.dirname, "..");
const execFileAsync = promisify(execFile);

describe("static boundary", () => {
  it("keeps application source free of client and network integrations", async () => {
    const source = await readFile(resolve(root, "src/app/page.tsx"), "utf8");
    expect(source).not.toMatch(/use client|fetch\(|axios|supabase|https?:\/\//);
  });

  it("rejects every required process fixture before product commands", async () => {
    const result = await execFileAsync(
      process.execPath,
      ["scripts/audit-static.mjs"],
      { cwd: root },
    );
    expect(result.stdout).toContain(
      "PROCESS_RED_FIXTURES PASS cases=7 valid=1",
    );
  });
});
