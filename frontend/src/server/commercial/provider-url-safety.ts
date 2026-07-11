import { isIP } from "node:net";
import { lookup } from "node:dns/promises";

export interface SafeProviderUrlResult {
  url: string;
  hostname: string;
  addresses: string[];
}

export interface ProviderUrlSafetyOptions {
  resolveHostname?: (hostname: string) => Promise<string[]>;
  followRedirect?: (url: string) => Promise<string | undefined>;
  allowedHostnames?: Iterable<string>;
}

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
]);

export async function isSafeProviderUrl(
  value: string,
  options: ProviderUrlSafetyOptions = {},
): Promise<boolean> {
  try {
    await assertSafeProviderUrl(value, options);
    return true;
  } catch {
    return false;
  }
}

export async function assertSafeProviderUrl(
  value: string,
  options: ProviderUrlSafetyOptions = {},
): Promise<SafeProviderUrlResult> {
  const url = parseProviderUrl(value);
  await assertUrlTargetIsSafe(url, options);

  const redirect = await options.followRedirect?.(url.toString());
  if (redirect !== undefined) {
    const redirectUrl = parseProviderUrl(redirect, "Provider URL redirect");
    try {
      await assertUrlTargetIsSafe(redirectUrl, options);
    } catch (error) {
      throw new Error(
        `Provider URL redirect is blocked: ${error instanceof Error ? error.message : "unsafe redirect"}`,
      );
    }
  }

  const addresses = await resolveAddresses(url.hostname, options);
  return {
    url: url.toString(),
    hostname: url.hostname,
    addresses,
  };
}

function parseProviderUrl(value: string, label = "Provider URL"): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} must be a valid absolute URL`);
  }
  if (url.protocol !== "https:") {
    throw new Error(`${label} must use https`);
  }
  if (url.username || url.password) {
    throw new Error(`${label} must not include credentials`);
  }
  if (!url.hostname) {
    throw new Error(`${label} must include a hostname`);
  }
  return url;
}

async function assertUrlTargetIsSafe(
  url: URL,
  options: ProviderUrlSafetyOptions,
): Promise<void> {
  const hostname = normalizeHostname(url.hostname);
  if (BLOCKED_HOSTNAMES.has(hostname) || hostname.endsWith(".localhost")) {
    throw new Error("Provider URL hostname is blocked");
  }

  const literalIp = normalizeIpLiteral(hostname);
  if (literalIp !== undefined) {
    assertPublicAddress(literalIp);
    return;
  }

  const addresses = await resolveAddresses(hostname, options);
  if (addresses.length === 0) {
    throw new Error("Provider URL hostname did not resolve");
  }
  const allowBlockedResolvedAddresses = isAllowedHostname(
    hostname,
    options.allowedHostnames,
  );
  for (const address of addresses) {
    assertPublicAddress(address, {
      allowBlocked: allowBlockedResolvedAddresses,
    });
  }
}

async function resolveAddresses(
  hostname: string,
  options: ProviderUrlSafetyOptions,
): Promise<string[]> {
  if (options.resolveHostname !== undefined) {
    return options.resolveHostname(hostname);
  }
  const records = await lookup(hostname, { all: true, verbatim: true });
  return records.map((record) => record.address);
}

function assertPublicAddress(
  address: string,
  options: { allowBlocked?: boolean } = {},
): void {
  const normalized = normalizeIpLiteral(address);
  if (normalized === undefined) {
    throw new Error("Provider URL resolved to an invalid address");
  }
  if (isBlockedIp(normalized) && options.allowBlocked !== true) {
    throw new Error(`Provider URL resolved to private or blocked address ${address}`);
  }
}

function normalizeHostname(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/\.$/, "");
}

function normalizeIpLiteral(value: string): string | undefined {
  const trimmed = value.trim().toLowerCase();
  const unbracketed =
    trimmed.startsWith("[") && trimmed.endsWith("]")
      ? trimmed.slice(1, -1)
      : trimmed;
  return isIP(unbracketed) === 0 ? undefined : unbracketed;
}

function isAllowedHostname(
  hostname: string,
  allowedHostnames: Iterable<string> | undefined,
): boolean {
  if (allowedHostnames === undefined) {
    return false;
  }
  const normalized = normalizeHostname(hostname);
  for (const allowed of allowedHostnames) {
    if (normalizeHostname(allowed) === normalized) {
      return true;
    }
  }
  return false;
}

function isBlockedIp(address: string): boolean {
  return isIP(address) === 4 ? isBlockedIpv4(address) : isBlockedIpv6(address);
}

function isBlockedIpv4(address: string): boolean {
  const parts = address.split(".").map((part) => Number(part));
  const [a = 0, b = 0] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function isBlockedIpv6(address: string): boolean {
  const normalized = address.toLowerCase();
  return (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe80:") ||
    normalized.startsWith("fec0:") ||
    normalized.startsWith("ff")
  );
}
