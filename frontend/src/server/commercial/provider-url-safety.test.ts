import assert from "node:assert/strict";
import test from "node:test";

import {
  ProviderUrlSafetyError,
  assertSafeProviderRedirects,
  isBlockedProviderHost,
  validateProviderBaseUrl,
} from "./provider-url-safety.js";

test("validateProviderBaseUrl rejects non-HTTPS and credentialed URLs", () => {
  for (const url of [
    "http://api.openai.com/v1",
    "https://user:pass@api.openai.com/v1",
  ]) {
    assert.throws(
      () => validateProviderBaseUrl(url, { allowedHosts: ["api.openai.com"] }),
      ProviderUrlSafetyError,
    );
  }
});

test("validateProviderBaseUrl rejects localhost and private network hosts", () => {
  for (const url of [
    "https://localhost/v1",
    "https://127.0.0.1/v1",
    "https://0.0.0.0/v1",
    "https://10.1.2.3/v1",
    "https://172.16.0.1/v1",
    "https://192.168.1.10/v1",
    "https://169.254.1.1/v1",
    "https://169.254.169.254/latest/meta-data",
    "https://[::1]/v1",
  ]) {
    assert.throws(
      () => validateProviderBaseUrl(url, { allowedHosts: ["api.openai.com"] }),
      ProviderUrlSafetyError,
    );
  }
});

test("validateProviderBaseUrl accepts explicitly allowed provider hosts", () => {
  assert.equal(
    validateProviderBaseUrl("https://api.openai.com/v1/", {
      allowedHosts: ["api.openai.com"],
    }),
    "https://api.openai.com/v1",
  );
  assert.equal(
    validateProviderBaseUrl("https://openrouter.ai/api/v1", {
      allowedHosts: ["api.openai.com", "openrouter.ai"],
    }),
    "https://openrouter.ai/api/v1",
  );
});

test("isBlockedProviderHost detects private IP ranges and local names", () => {
  assert.equal(isBlockedProviderHost("localhost"), true);
  assert.equal(isBlockedProviderHost("127.0.0.1"), true);
  assert.equal(isBlockedProviderHost("10.0.0.2"), true);
  assert.equal(isBlockedProviderHost("172.31.255.255"), true);
  assert.equal(isBlockedProviderHost("192.168.0.2"), true);
  assert.equal(isBlockedProviderHost("169.254.169.254"), true);
  assert.equal(isBlockedProviderHost("::1"), true);
  assert.equal(isBlockedProviderHost("api.openai.com"), false);
});

test("assertSafeProviderRedirects rejects redirects to blocked hosts", async () => {
  await assert.rejects(
    assertSafeProviderRedirects("https://api.openai.com/v1", {
      allowedHosts: ["api.openai.com"],
      fetchHead: async () => ({
        status: 302,
        headers: new Headers({ location: "https://127.0.0.1/internal" }),
      }),
    }),
    ProviderUrlSafetyError,
  );
});

test("assertSafeProviderRedirects accepts redirects to allowed hosts", async () => {
  let calls = 0;
  await assert.doesNotReject(
    assertSafeProviderRedirects("https://api.openai.com/v1", {
      allowedHosts: ["api.openai.com"],
      fetchHead: async () => {
        calls += 1;
        return calls === 1
          ? {
              status: 308,
              headers: new Headers({ location: "https://api.openai.com/v1/" }),
            }
          : {
              status: 200,
              headers: new Headers(),
            };
      },
    }),
  );
});
