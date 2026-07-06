export interface ProviderUrlSafetyOptions {
  allowedHosts?: string[];
}

export interface ProviderRedirectSafetyOptions extends ProviderUrlSafetyOptions {
  fetchHead?: FetchHead;
  maxRedirects?: number;
}

export type FetchHead = (
  url: string,
  init: { method: "HEAD"; redirect: "manual" },
) => Promise<{
  status: number;
  headers: Pick<Headers, "get">;
}>;

export class ProviderUrlSafetyError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ProviderUrlSafetyError";
  }
}

export function validateProviderBaseUrl(
  rawUrl: string,
  options: ProviderUrlSafetyOptions = {},
): string {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new ProviderUrlSafetyError("invalid_provider_url", "Provider URL is invalid.");
  }

  if (url.protocol !== "https:") {
    throw new ProviderUrlSafetyError("provider_url_https_required", "Provider URL must use HTTPS.");
  }
  if (url.username || url.password) {
    throw new ProviderUrlSafetyError("provider_url_credentials_forbidden", "Provider URL cannot include credentials.");
  }

  const hostname = normalizeHost(url.hostname);
  if (isBlockedProviderHost(hostname)) {
    throw new ProviderUrlSafetyError("provider_url_blocked_host", "Provider URL host is blocked.");
  }
  if (!isAllowedHost(hostname, options.allowedHosts)) {
    throw new ProviderUrlSafetyError("provider_url_host_not_allowed", "Provider URL host is not allowed.");
  }

  url.hash = "";
  const normalized = url.toString();
  return normalized.endsWith("/") ? normalized.slice(0, -1) : normalized;
}

export function isBlockedProviderHost(host: string): boolean {
  const normalized = normalizeHost(host);
  if (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized === "0.0.0.0"
  ) {
    return true;
  }

  if (isBlockedIpv4Host(normalized)) {
    return true;
  }

  return isBlockedIpv6Host(normalized);
}

export async function assertSafeProviderRedirects(
  rawUrl: string,
  options: ProviderRedirectSafetyOptions = {},
): Promise<void> {
  let currentUrl = validateProviderBaseUrl(rawUrl, options);
  const fetchHead = options.fetchHead ?? defaultFetchHead;
  const maxRedirects = options.maxRedirects ?? 3;

  for (let redirects = 0; redirects < maxRedirects; redirects += 1) {
    const response = await fetchHead(currentUrl, { method: "HEAD", redirect: "manual" });
    if (response.status < 300 || response.status >= 400) {
      return;
    }
    const location = response.headers.get("location");
    if (!location) {
      return;
    }
    const redirectedUrl = new URL(location, currentUrl).toString();
    currentUrl = validateProviderBaseUrl(redirectedUrl, options);
  }

  throw new ProviderUrlSafetyError("provider_url_too_many_redirects", "Provider URL redirects too many times.");
}

async function defaultFetchHead(
  url: string,
  init: { method: "HEAD"; redirect: "manual" },
): ReturnType<FetchHead> {
  return fetch(url, init);
}

function isAllowedHost(host: string, allowedHosts: string[] | undefined): boolean {
  if (!allowedHosts || allowedHosts.length === 0) {
    return true;
  }
  const normalizedAllowedHosts = allowedHosts.map(normalizeHost);
  return normalizedAllowedHosts.some((allowedHost) => host === allowedHost);
}

function isBlockedIpv4Host(host: string): boolean {
  const octets = parseIpv4(host);
  if (!octets) {
    return false;
  }
  const value = ipv4ToInt(octets);
  return (
    isIpv4InRange(value, "10.0.0.0", 8) ||
    isIpv4InRange(value, "127.0.0.0", 8) ||
    isIpv4InRange(value, "169.254.0.0", 16) ||
    isIpv4InRange(value, "172.16.0.0", 12) ||
    isIpv4InRange(value, "192.168.0.0", 16) ||
    isIpv4InRange(value, "0.0.0.0", 8)
  );
}

function isBlockedIpv6Host(host: string): boolean {
  const normalized = host.replace(/^\[|\]$/g, "").toLowerCase();
  return (
    normalized === "::1" ||
    normalized === "0:0:0:0:0:0:0:1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe80:") ||
    normalized.startsWith("::ffff:127.") ||
    normalized.startsWith("::ffff:10.") ||
    normalized.startsWith("::ffff:192.168.") ||
    normalized.startsWith("::ffff:169.254.")
  );
}

function parseIpv4(host: string): [number, number, number, number] | undefined {
  const parts = host.split(".");
  if (parts.length !== 4) {
    return undefined;
  }
  const octets = parts.map((part) => Number(part));
  if (
    octets.some((octet, index) =>
      !Number.isInteger(octet) ||
      octet < 0 ||
      octet > 255 ||
      String(octet) !== parts[index]
    )
  ) {
    return undefined;
  }
  return octets as [number, number, number, number];
}

function ipv4ToInt(octets: [number, number, number, number]): number {
  return (
    ((octets[0] << 24) >>> 0) +
    (octets[1] << 16) +
    (octets[2] << 8) +
    octets[3]
  ) >>> 0;
}

function isIpv4InRange(value: number, cidrBase: string, prefixLength: number): boolean {
  const base = parseIpv4(cidrBase);
  if (!base) {
    return false;
  }
  const mask = prefixLength === 0 ? 0 : (0xffffffff << (32 - prefixLength)) >>> 0;
  return (value & mask) === (ipv4ToInt(base) & mask);
}

function normalizeHost(host: string): string {
  return host.trim().replace(/^\[|\]$/g, "").toLowerCase();
}
