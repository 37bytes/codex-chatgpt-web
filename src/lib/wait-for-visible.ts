import type { Locator } from "playwright-core";

function timeoutError(message: string): Error {
  const error = new Error(message);
  error.name = "TimeoutError";
  return error;
}

function waitPoll(milliseconds: number, signal?: AbortSignal): Promise<void> {
  if (!signal) {
    const { promise, resolve } = Promise.withResolvers<void>();
    setTimeout(resolve, milliseconds);
    return promise;
  }
  if (signal.aborted) return Promise.reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
  const { promise, resolve, reject } = Promise.withResolvers<void>();
  const timer = setTimeout(() => {
    signal.removeEventListener("abort", onAbort);
    resolve();
  }, milliseconds);
  const onAbort = () => {
    clearTimeout(timer);
    reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
  };
  signal.addEventListener("abort", onAbort, { once: true });
  return promise;
}

export async function waitForVisible(
  locator: Locator,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (signal?.aborted) throw signal.reason ?? new DOMException("Aborted", "AbortError");
    if (await locator.isVisible().catch(() => false)) return;
    await waitPoll(Math.min(100, Math.max(1, deadline - Date.now())), signal);
  }
  throw timeoutError(`Locator did not become visible within ${timeoutMs}ms`);
}
