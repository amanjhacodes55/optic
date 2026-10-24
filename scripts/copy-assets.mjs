// Copies the rrweb recorder next to the tracker so sites load both from the Optic origin.
// Runs on postinstall; the output is git-ignored.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.join(root, "node_modules/@rrweb/record/dist/record.umd.min.cjs");
const dest = path.join(root, "public/rrweb-record.js");

if (!fs.existsSync(src)) {
  console.warn("[optic] @rrweb/record not installed; session replay will be unavailable");
  process.exit(0);
}
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.copyFileSync(src, dest);
console.log("[optic] copied rrweb recorder to public/rrweb-record.js");
