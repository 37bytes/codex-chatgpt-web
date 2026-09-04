import type { Locator, Page } from "playwright-core";
import type { ChatGptWebAccountCapabilities } from "./chatgpt-web-models";
import { waitForVisible } from "./lib/wait-for-visible";

export const CHATGPT_TEMPORARY_CHAT_URL = "https://chatgpt.com/?temporary-chat=true";
export const CHATGPT_COMPOSER_SELECTOR = [
  '[data-testid="prompt-textarea"]',
  "#prompt-textarea",
  '[contenteditable="true"][data-lexical-editor="true"]',
].join(", ");
export const CHATGPT_EFFORT_CONTROL_SELECTOR = [
  'button[aria-haspopup="menu"][data-tone="neutral"]',
  'button[data-testid="model-switcher-dropdown-button"][aria-haspopup="menu"]',
].join(", ");
export const CHATGPT_EFFORT_MENU_SELECTOR = [
  '[data-testid="composer-intelligence-picker-content"]:has([role="menuitemradio"], [data-model-reasoning-effort-slider])',
  '[role="menu"]:has([role="menuitemradio"], [data-model-reasoning-effort-slider])',
  '[role="group"]:has([role="menuitemradio"], [data-model-reasoning-effort-slider])',
].join(", ");
export const CHATGPT_EFFORT_ITEM_SELECTOR = '[role="menuitemradio"]';
export const CHATGPT_EFFORT_SLIDER_SELECTOR = [
  '[data-model-reasoning-effort-slider] [role="slider"]',
  '[role="menu"] [role="slider"]',
].join(", ");
export const CHATGPT_EFFORT_SLIDER_MAX_OPTIONS = 5;
export const CHATGPT_STOP_BUTTON_SELECTOR = '[data-testid="stop-button"]';
export const CHATGPT_COMPLETION_ACTION_SELECTOR = 'button[data-testid="copy-turn-action-button"]';
export const CHATGPT_ASSISTANT_TURN_SELECTOR = [
  '[data-testid^="conversation-turn-"][data-turn="assistant"]',
  '[data-testid^="conversation-turn-"][data-message-author-role="assistant"]',
  '[data-testid^="conversation-turn-"]:has([data-message-author-role="assistant"])',
].join(", ");
export const CHATGPT_USER_TURN_SELECTOR = [
  '[data-testid^="conversation-turn-"][data-turn="user"]',
  '[data-testid^="conversation-turn-"][data-message-author-role="user"]',
  '[data-testid^="conversation-turn-"]:has([data-message-author-role="user"])',
].join(", ");

export interface ChatGptEffortSliderState {
  min: number;
  max: number;
  value: number;
}

function safeIntegerAttribute(value: string | null): number | undefined {
  if (value === null || !/^-?\d+$/.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

export function parseChatGptEffortSliderState(
  rawMin: string | null,
  rawMax: string | null,
  rawValue: string | null,
): ChatGptEffortSliderState | undefined {
  const min = safeIntegerAttribute(rawMin);
  const max = safeIntegerAttribute(rawMax);
  const value = safeIntegerAttribute(rawValue);
  if (min === undefined || max === undefined || value === undefined) return undefined;
  const optionCount = max - min + 1;
  if (optionCount < 1 || optionCount > CHATGPT_EFFORT_SLIDER_MAX_OPTIONS) return undefined;
  if (value < min || value > max) return undefined;
  return { min, max, value };
}

async function anyVisible(locator: Locator): Promise<boolean> {
  const count = await locator.count();
  for (let index = 0; index < count; index += 1) {
    if (await locator.nth(index).isVisible().catch(() => false)) return true;
  }
  return false;
}

export function chatGptAccountChooserCandidate(text: string): boolean {
  return /[^\s@]+@[^\s@]+\.[^\s@]+/.test(text.trim());
}

export async function dismissChatGptAccountChooser(page: Page): Promise<boolean> {
  const roots = page.locator('[role="dialog"], main').filter({ visible: true });
  for (let rootIndex = 0; rootIndex < await roots.count(); rootIndex += 1) {
    const root = roots.nth(rootIndex);
    const clicked = await root.evaluate((container) => {
      const rendered = (candidate: HTMLElement): boolean => {
        const style = getComputedStyle(candidate);
        const bounds = candidate.getBoundingClientRect();
        return candidate.isConnected && style.display !== "none" && style.visibility !== "hidden"
          && (bounds.width > 0 || bounds.height > 0);
      };
      const accountEmail = (text: string | null | undefined): boolean => (
        /[^\s@]+@[^\s@]+\.[^\s@]+/.test((text ?? "").trim())
      );
      const candidateText = (candidate: HTMLElement): string => candidate.innerText ?? candidate.textContent ?? "";
      const candidates = [...container.querySelectorAll<HTMLElement>('button, a, [role="button"], [tabindex]')]
        .filter(candidate => rendered(candidate) && accountEmail(candidateText(candidate)))
        .sort((left, right) => candidateText(left).length - candidateText(right).length);
      const candidate = candidates[0];
      if (!candidate) return false;
      candidate.click();
      return true;
    });
    if (!clicked) continue;
    return true;
  }
  return false;
}

export async function waitForAuthenticatedChatGptComposer(page: Page, timeoutMs = 60_000): Promise<void> {
  const composer = page.locator(CHATGPT_COMPOSER_SELECTOR);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await anyVisible(composer)) return;
    if (await dismissChatGptAccountChooser(page)) {
      await new Promise(resolveSleep => setTimeout(resolveSleep, 250));
      continue;
    }
    await new Promise(resolveSleep => setTimeout(resolveSleep, 100));
  }
  throw new Error("ChatGPT authentication could not be verified: no visible composer is present");
}

export async function assertAuthenticatedChatGptPage(page: Page): Promise<void> {
  const composer = page.locator(
    CHATGPT_COMPOSER_SELECTOR,
  );
  if (!await anyVisible(composer)) {
    throw new Error("ChatGPT authentication could not be verified: no visible composer is present");
  }
}

export async function assertTemporaryChatPage(page: Page): Promise<void> {
  const url = new URL(page.url());
  const expected = new URL(CHATGPT_TEMPORARY_CHAT_URL);
  if (url.origin !== expected.origin || url.pathname !== expected.pathname || url.searchParams.get("temporary-chat") !== "true") {
    throw new Error(`ChatGPT left the isolated Temporary Chat surface (${page.url()})`);
  }
}

export async function detectChatGptAccountCapabilities(
  page: Page,
  options: { selectorTimeoutMs?: number; stableAbsenceMs?: number } = {},
): Promise<ChatGptWebAccountCapabilities> {
  const composers = page.locator(CHATGPT_COMPOSER_SELECTOR).filter({ visible: true });
  const composer = composers.last();
  const composerForm = composer.locator("xpath=ancestor::form[1]");
  const effortButton = composerForm.locator(CHATGPT_EFFORT_CONTROL_SELECTOR).last();
  const deadline = Date.now() + (options.selectorTimeoutMs ?? 30_000);
  const stableAbsenceMs = options.stableAbsenceMs ?? 3_000;
  let absenceSince: number | undefined;
  let presenceObservations = 0;
  while (true) {
    const effortVisible = await effortButton.isVisible().catch(() => false);
    if (effortVisible) {
      presenceObservations += 1;
      absenceSince = undefined;
      if (presenceObservations >= 2) break;
      await new Promise(resolveSleep => setTimeout(resolveSleep, 100));
      continue;
    }
    presenceObservations = 0;
    const composerReady = await composers.count().then(count => count === 1).catch(() => false);
    const formReady = await composerForm.count().then(count => count === 1).catch(() => false);
    const documentReady = await page.evaluate(() => document.readyState === "complete").catch(() => false);
    if (composerReady && formReady && documentReady) {
      absenceSince ??= Date.now();
      if (Date.now() - absenceSince >= stableAbsenceMs) {
        return { solAvailable: false, proAvailable: false };
      }
    } else {
      absenceSince = undefined;
    }
    if (Date.now() >= deadline) {
      throw new Error("ChatGPT account capability probe did not reach a stable composer state");
    }
    await new Promise(resolveSleep => setTimeout(resolveSleep, 100));
  }
  const menu = page.locator(CHATGPT_EFFORT_MENU_SELECTOR).last();
  const menuVisible = await menu.isVisible().catch(() => false);
  const menuExpanded = await effortButton.getAttribute("aria-expanded").catch(() => null);
  if (!menuVisible && menuExpanded !== "true") await effortButton.click({ force: true });
  try {
    const efforts = menu.locator(CHATGPT_EFFORT_ITEM_SELECTOR);
    const slider = page.locator(CHATGPT_EFFORT_SLIDER_SELECTOR).filter({ visible: true }).last();
    const waitAbort = new AbortController();
    try {
      const ready = await Promise.race([
        waitForVisible(efforts.first(), 70_000, waitAbort.signal)
          .then(() => "items" as const),
        waitForVisible(slider, 70_000, waitAbort.signal)
          .then(() => "slider" as const),
      ]);
      let sliderVisible = ready === "slider" || await slider.isVisible().catch(() => false);
      if (!sliderVisible) {
        sliderVisible = await waitForVisible(slider, 5_000).then(() => true, () => false);
      }
      if (!sliderVisible) {
        return { solAvailable: true, proAvailable: await efforts.count() >= 5 };
      }
      const state = parseChatGptEffortSliderState(
        await slider.getAttribute("aria-valuemin"),
        await slider.getAttribute("aria-valuemax"),
        await slider.getAttribute("aria-valuenow"),
      );
      if (!state) throw new Error("ChatGPT effort slider exposed an invalid ARIA range");
      return { solAvailable: true, proAvailable: state.max - state.min + 1 >= 5 };
    } finally {
      waitAbort.abort();
    }
  } finally {
    await page.keyboard.press("Escape").catch(() => {});
  }
}
