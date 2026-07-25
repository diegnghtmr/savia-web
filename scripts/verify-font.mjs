import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const fontUrl = new URL(
  "../src/app/fonts/inter-latin-wght-normal.woff2",
  import.meta.url,
);
const licenseUrl = new URL("../LICENSES/Inter-OFL-1.1.txt", import.meta.url);
const expectedSha256 =
  "3100e775e8616cd2611beecfa23a4263d7037586789b43f035236a2e6fbd4c62";

const [font, license] = await Promise.all([
  readFile(fontUrl),
  readFile(licenseUrl, "utf8"),
]);
const actualSha256 = createHash("sha256").update(font).digest("hex");

if (actualSha256 !== expectedSha256) {
  throw new Error(`Inter font digest mismatch: ${actualSha256}`);
}
if (!license.includes("SIL OPEN FONT LICENSE Version 1.1")) {
  throw new Error("Inter OFL-1.1 license text is missing");
}

process.stdout.write(
  `FONT_VERIFY PASS sha256=${actualSha256} bytes=${font.length}\n`,
);
