/**
 * Rewrites the built manifest with the absolute URLs Trimble Connect needs.
 *
 * The app itself is built with relative paths, but an extension manifest must point at
 * fully-qualified URLs. Rather than hard-code the deployment address, CI passes it in
 * from the configure-pages action, so the manifest is always correct for wherever this
 * happens to be deployed.
 *
 * Usage: node scripts/write-manifest.mjs <base-url> [title-suffix]
 *   node scripts/write-manifest.mjs https://user.github.io/ifc-floors/
 *   node scripts/write-manifest.mjs https://user.github.io/ifc-floors/dev/ " (dev)"
 *
 * The suffix is what keeps the two environments apart in the Trimble side panel, where
 * they otherwise appear as two entries with the same name.
 */
import { readFile, writeFile } from "node:fs/promises";

const [, , baseUrl, titleSuffix] = process.argv;
if (!baseUrl) {
  console.error("Usage: node scripts/write-manifest.mjs <base-url> [title-suffix]");
  process.exit(1);
}

const normalised = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
const template = await readFile("public/manifest.json", "utf8");
const manifest = JSON.parse(template.replaceAll("__BASE_URL__", normalised));

if (titleSuffix) manifest.title += titleSuffix;

await writeFile("dist/manifest.json", `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Manifest written for ${normalised}`);
console.log(manifest);
