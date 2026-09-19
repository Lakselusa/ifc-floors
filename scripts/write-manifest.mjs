/**
 * Rewrites the built manifest with the absolute URLs Trimble Connect needs.
 *
 * The app itself is built with relative paths, but an extension manifest must point at
 * fully-qualified URLs. Rather than hard-code the GitHub Pages address, CI passes it in
 * from the configure-pages action, so the manifest is always correct for wherever this
 * happens to be deployed.
 *
 * Usage: node scripts/write-manifest.mjs https://user.github.io/ifc-floors/
 */
import { readFile, writeFile } from "node:fs/promises";

const baseUrl = process.argv[2];
if (!baseUrl) {
  console.error("Usage: node scripts/write-manifest.mjs <base-url>");
  process.exit(1);
}

const normalised = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
const template = await readFile("public/manifest.json", "utf8");
const manifest = template.replaceAll("__BASE_URL__", normalised);

await writeFile("dist/manifest.json", manifest);
console.log(`Manifest written for ${normalised}`);
console.log(manifest);
