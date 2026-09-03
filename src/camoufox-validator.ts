import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { BrowserContextOptions } from "playwright-core";
import {
  assertAuthenticatedChatGptPage,
  assertTemporaryChatPage,
  dismissChatGptAccountChooser,
  CHATGPT_TEMPORARY_CHAT_URL,
  detectChatGptAccountCapabilities,
} from "./chatgpt-session";
import { launchManagedBrowser, newManagedBrowserContext } from "./camoufox-browser";

export async function validateCamoufoxStorageState(path: string): Promise<{
  authenticated: true;
  solAvailable: boolean;
  proAvailable: boolean;
}> {
  const storageStatePath = resolve(path);
  if (!existsSync(storageStatePath)) {
    throw new Error(`ChatGPT storage state does not exist: ${storageStatePath}`);
  }
  let storageState: NonNullable<BrowserContextOptions["storageState"]>;
  try {
    storageState = JSON.parse(readFileSync(storageStatePath, "utf8"));
  } catch {
    throw new Error("ChatGPT storage state is not valid JSON");
  }
  const browser = await launchManagedBrowser({ chromeExecutablePath: "", headed: false });
  try {
    const context = await newManagedBrowserContext(browser, storageState);
    try {
      const page = await context.newPage();
      await page.goto(CHATGPT_TEMPORARY_CHAT_URL, {
        waitUntil: "domcontentloaded",
        timeout: 60_000,
      });
      const composer = page.getByRole("textbox", { name: "Chat with ChatGPT" }).or(
        page.locator('[data-testid="prompt-textarea"], #prompt-textarea, [contenteditable="true"][data-lexical-editor="true"]'),
      ).first();
      await composer.waitFor({ state: "visible", timeout: 60_000 });
      await dismissChatGptAccountChooser(page);
      await assertAuthenticatedChatGptPage(page);
      await assertTemporaryChatPage(page);
      return {
        authenticated: true,
        ...await detectChatGptAccountCapabilities(page, {
          selectorTimeoutMs: 60_000,
          stableAbsenceMs: 15_000,
        }),
      };
    } finally {
      await context.close();
    }
  } finally {
    await browser.close();
  }
}
