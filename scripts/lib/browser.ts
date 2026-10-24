import fs from "node:fs";
import { chromium, type Browser } from "playwright-core";

// Uses an installed Chrome/Chromium rather than downloading one. Override with CHROME_PATH.
export async function launch(opts: { headless?: boolean } = {}): Promise<Browser> {
  const candidates = [process.env.CHROME_PATH, "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"];
  const executablePath = candidates.find((p) => p && fs.existsSync(p));
  if (!executablePath) throw new Error("No Chrome found. Set CHROME_PATH to a Chrome or Chromium binary.");
  return chromium.launch({ executablePath, headless: opts.headless ?? true });
}

export const BASE_URL = (process.env.OPTIC_URL ?? "http://localhost:3000").replace(/\/$/, "");
