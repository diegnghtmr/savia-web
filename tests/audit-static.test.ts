import { readdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const root = resolve(import.meta.dirname, "..");
const execFileAsync = promisify(execFile);

function runAudit() {
  return execFileAsync(process.execPath, ["scripts/audit-static.mjs"], {
    cwd: root,
  });
}

async function auditFailure(): Promise<string> {
  try {
    await runAudit();
  } catch (error) {
    return String((error as { stderr?: string }).stderr ?? "");
  }
  throw new Error("the audit unexpectedly passed");
}

async function withSource<T>(
  path: string,
  source: string,
  body: () => Promise<T>,
): Promise<T> {
  const absolute = resolve(root, path);
  await writeFile(absolute, source, "utf8");
  try {
    return await body();
  } finally {
    await rm(absolute, { force: true });
  }
}

describe("static boundary", () => {
  it("keeps application source free of client and network integrations", async () => {
    const source = await readFile(resolve(root, "src/app/page.tsx"), "utf8");
    expect(source).not.toMatch(/use client|fetch\(|axios|supabase|https?:\/\//);
  });

  it("rejects every required process fixture before product commands", async () => {
    const result = await runAudit();
    expect(result.stdout).toContain(
      "PROCESS_RED_FIXTURES PASS cases=7 valid=1",
    );
  });

  it("rejects every required client boundary fixture", async () => {
    const result = await runAudit();
    expect(result.stdout).toContain(
      "CLIENT_BOUNDARY_FIXTURES PASS cases=8 valid=1",
    );
  });
});

describe("the test suite wiring", () => {
  it("runs every test file from some package script", async () => {
    // The scripts name their files one by one, and CI runs the scripts. A file
    // nobody named is a suite that exists, passes locally, and never runs —
    // which is how `test:server` sat outside CI until this branch noticed.
    const manifest = JSON.parse(
      await readFile(resolve(root, "package.json"), "utf8"),
    );
    const named = new Set(
      Object.values(manifest.scripts as Record<string, string>)
        .filter((script) => script.startsWith("vitest run "))
        .flatMap((script) => script.slice("vitest run ".length).split(/\s+/)),
    );
    const files = (await readdir(resolve(root, "tests")))
      .filter((name) => /\.test\.tsx?$/.test(name))
      .map((name) => `tests/${name}`);

    expect(files.filter((file) => !named.has(file))).toEqual([]);
  });
});

describe("the client boundary guard against real source", () => {
  it("catches a client component that imports the server HTTP layer", async () => {
    const stderr = await withSource(
      "src/app/_components/onboarding-panel.tsx",
      [
        '"use client";',
        "",
        'import { onboard } from "@/lib/onboarding-gateway";',
        "",
        "export function OnboardingPanel() {",
        "  void onboard;",
        "  return null;",
        "}",
        "",
      ].join("\n"),
      auditFailure,
    );
    expect(stderr).toContain("src/lib/onboarding-gateway.ts");
    expect(stderr).toContain("src/app/_components/onboarding-panel.tsx");
    expect(stderr).toContain("server module");
  });

  it("catches a client component that imports the session layer through a helper", async () => {
    const stderr = await withSource(
      "src/app/_components/session-badge.tsx",
      [
        '"use client";',
        "",
        'import { label } from "./session-label";',
        "",
        "export function SessionBadge() {",
        "  return label();",
        "}",
        "",
      ].join("\n"),
      () =>
        withSource(
          "src/app/_components/session-label.ts",
          [
            'import { readSession } from "@/lib/session";',
            "",
            "export function label() {",
            "  void readSession;",
            '  return "";',
            "}",
            "",
          ].join("\n"),
          auditFailure,
        ),
    );
    expect(stderr).toContain("src/lib/session.ts");
    expect(stderr).toContain("src/app/_components/session-badge.tsx");
  });

  it("catches a client component that calls fetch directly", async () => {
    const stderr = await withSource(
      "src/app/_components/direct-call.tsx",
      [
        '"use client";',
        "",
        "export function DirectCall() {",
        '  void fetch("/v1/onboarding");',
        "  return null;",
        "}",
        "",
      ].join("\n"),
      auditFailure,
    );
    expect(stderr).toContain("src/app/_components/direct-call.tsx");
  });

  it("passes once the violating source is gone", async () => {
    const result = await runAudit();
    expect(result.stdout).toContain(
      "CLIENT_BOUNDARY_FIXTURES PASS cases=8 valid=1",
    );
  });
});
