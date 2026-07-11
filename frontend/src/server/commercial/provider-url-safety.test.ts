import assert from "node:assert/strict";
import test from "node:test";

import {
  assertSafeProviderUrl,
  isSafeProviderUrl,
} from "./provider-url-safety.js";

test("provider URL safety accepts HTTPS provider hosts", async () => {
  const result = await assertSafeProviderUrl("https://api.openai.com/v1", {
    resolveHostname: async () => ["172.64.154.211"],
  });

  assert.deepEqual(result, {
    url: "https://api.openai.com/v1",
    hostname: "api.openai.com",
    addresses: ["172.64.154.211"],
  });
});

test("provider URL safety rejects unsafe schemes, credentials, local hosts, and private IPs", async () => {
  const unsafeUrls = [
    "http://api.example.test",
    "https://user:pass@api.example.test",
    "https://localhost/v1",
    "https://127.0.0.1/v1",
    "https://10.0.0.2/v1",
    "https://172.16.5.1/v1",
    "https://192.168.1.10/v1",
    "https://169.254.169.254/latest/meta-data",
    "https://[::1]/v1",
    "https://[fc00::1]/v1",
  ];

  for (const url of unsafeUrls) {
    await assert.rejects(
      assertSafeProviderUrl(url, {
        resolveHostname: async () => ["203.0.113.10"],
      }),
      /provider url/i,
      url,
    );
  }
});

test("provider URL safety rejects DNS records resolving to blocked addresses", async () => {
  await assert.rejects(
    assertSafeProviderUrl("https://api.example.test/v1", {
      resolveHostname: async () => ["192.168.1.3"],
    }),
    /private|blocked/i,
  );
  assert.equal(
    await isSafeProviderUrl("https://api.example.test/v1", {
      resolveHostname: async () => ["203.0.113.10"],
    }),
    true,
  );
});

test("provider URL safety permits blocked DNS records only for explicitly allowed hostnames", async () => {
  const result = await assertSafeProviderUrl("https://grok.mini2000.top/v1", {
    resolveHostname: async () => ["198.18.2.90"],
    allowedHostnames: ["grok.mini2000.top"],
  });

  assert.deepEqual(result, {
    url: "https://grok.mini2000.top/v1",
    hostname: "grok.mini2000.top",
    addresses: ["198.18.2.90"],
  });

  await assert.rejects(
    assertSafeProviderUrl("https://127.0.0.1/v1", {
      allowedHostnames: ["127.0.0.1"],
    }),
    /private|blocked/i,
  );
});

test("provider URL safety rejects blocked redirects", async () => {
  await assert.rejects(
    assertSafeProviderUrl("https://api.example.test/v1", {
      resolveHostname: async (hostname) =>
        hostname === "api.example.test" ? ["203.0.113.10"] : ["127.0.0.1"],
      followRedirect: async () => "https://localhost/metadata",
    }),
    /redirect/i,
  );
});
