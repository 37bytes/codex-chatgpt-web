import { readFileSync } from "node:fs";
import { launchOptions } from "camoufox-js";
import { chromium, firefox, type Browser, type BrowserContext, type BrowserContextOptions } from "playwright-core";

export type ManagedBrowserEngine = "chromium" | "camoufox";

export function managedBrowserEngine(env: NodeJS.ProcessEnv = process.env): ManagedBrowserEngine {
  const value = env.CODEX_CHATGPT_WEB_BROWSER_ENGINE?.trim().toLowerCase() || "chromium";
  if (value !== "chromium" && value !== "camoufox") {
    throw new Error("CODEX_CHATGPT_WEB_BROWSER_ENGINE must be chromium or camoufox");
  }
  return value;
}

export function camoufoxProxy(env: NodeJS.ProcessEnv = process.env): { server: string } | undefined {
  const raw = env.CODEX_CHATGPT_WEB_PROXY_URL?.trim() || env.GOST_PROXY_URL?.trim();
  if (!raw) return undefined;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("ChatGPT Web browser proxy must be an absolute HTTP(S) URL");
  }
  if ((parsed.protocol !== "http:" && parsed.protocol !== "https:")
    || parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash) {
    throw new Error("ChatGPT Web browser proxy must be a credential-free HTTP(S) origin");
  }
  return { server: parsed.origin };
}

export function camoufoxOS(env: NodeJS.ProcessEnv = process.env): "windows" | "macos" | "linux" {
  const value = env.CODEX_CHATGPT_WEB_BROWSER_OS?.trim().toLowerCase() || "macos";
  if (value !== "windows" && value !== "macos" && value !== "linux") {
    throw new Error("CODEX_CHATGPT_WEB_BROWSER_OS must be windows, macos, or linux");
  }
  return value;
}

export async function launchManagedBrowser(options: {
  chromeExecutablePath: string;
  headed: boolean;
}): Promise<Browser> {
  if (managedBrowserEngine() === "chromium") {
    return chromium.launch({
      executablePath: options.chromeExecutablePath,
      headless: !options.headed,
    });
  }
  const proxy = camoufoxProxy();
  const camoufoxOptions = await launchOptions({
    os: camoufoxOS(),
    executable_path: process.env.CAMOUFOX_EXECUTABLE?.trim() || undefined,
    headless: true,
    humanize: true,
    enable_cache: true,
    proxy,
    geoip: proxy !== undefined,
    exclude_addons: ["UBO"],
  });
  return firefox.launch(camoufoxOptions);
}

export async function newManagedBrowserContext(
  browser: Browser,
  storageState: NonNullable<BrowserContextOptions["storageState"]>,
): Promise<BrowserContext> {
  if (managedBrowserEngine() === "chromium") {
    return browser.newContext({ storageState });
  }
  const decoded = typeof storageState === "string"
    ? JSON.parse(readFileSync(storageState, "utf8"))
    : storageState;
  if (!decoded || typeof decoded !== "object" || !Array.isArray(decoded.cookies) || !Array.isArray(decoded.origins)) {
    throw new Error("ChatGPT storage state has an invalid shape");
  }
  const context = await browser.newContext({
    viewport: null,
    permissions: ["geolocation"],
    proxy: camoufoxProxy(),
  });
  await context.addCookies(decoded.cookies);
  if (decoded.origins.length > 0) {
    await context.addInitScript((origins: Array<{ origin: string; localStorage?: Array<{ name: string; value: string }> }>) => {
      const current = origins.find(item => item.origin === location.origin);
      for (const item of current?.localStorage ?? []) localStorage.setItem(item.name, item.value);
    }, decoded.origins);
  }
  return context;
}
