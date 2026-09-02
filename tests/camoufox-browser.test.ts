import { describe, expect, test } from "bun:test";
import { camoufoxOS, camoufoxProxy, managedBrowserEngine } from "../src/camoufox-browser";

describe("managed Camoufox browser engine", () => {
  test("defaults to Chromium and accepts explicit Camoufox", () => {
    expect(managedBrowserEngine({})).toBe("chromium");
    expect(managedBrowserEngine({ CODEX_CHATGPT_WEB_BROWSER_ENGINE: " camoufox " })).toBe("camoufox");
    expect(() => managedBrowserEngine({ CODEX_CHATGPT_WEB_BROWSER_ENGINE: "webkit" })).toThrow();
    expect(camoufoxOS({})).toBe("macos");
    expect(camoufoxOS({ CODEX_CHATGPT_WEB_BROWSER_OS: "linux" })).toBe("linux");
    expect(() => camoufoxOS({ CODEX_CHATGPT_WEB_BROWSER_OS: "android" })).toThrow();
  });

  test("accepts only credential-free HTTP proxy origins", () => {
    expect(camoufoxProxy({ GOST_PROXY_URL: "http://gost-ipv6-a-proxy:3128" })).toEqual({
      server: "http://gost-ipv6-a-proxy:3128",
    });
    expect(camoufoxProxy({})).toBeUndefined();
    expect(() => camoufoxProxy({ GOST_PROXY_URL: "http://user:secret@gost:3128" })).toThrow();
    expect(() => camoufoxProxy({ GOST_PROXY_URL: "socks5://gost:1080" })).toThrow();
    expect(() => camoufoxProxy({ GOST_PROXY_URL: "http://gost:3128/path" })).toThrow();
  });
});
