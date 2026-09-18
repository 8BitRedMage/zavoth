import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import https from "node:https";
import { BlockList, isIP, type LookupFunction } from "node:net";

// Fetches from hosts that users name (a company's own website), so it must
// never be steerable at our own network: https only, no IP literals, and the
// resolved address is checked inside the connection's DNS lookup, which
// closes the gap a check-then-fetch leaves open to DNS rebinding.
// Fixed third-party API hosts do not need this and use plain `fetch`.

const blockedAddresses = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  blockedAddresses.addSubnet(network, prefix, "ipv4");
}
for (const [network, prefix] of [
  ["::", 127], // :: and ::1
  ["64:ff9b::", 96],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const) {
  blockedAddresses.addSubnet(network, prefix, "ipv6");
}

export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 0) return false;
  // ::ffff:10.0.0.1 is 10.0.0.1 in disguise.
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address)?.[1];
  if (mapped) return !blockedAddresses.check(mapped, "ipv4");
  return !blockedAddresses.check(address, family === 4 ? "ipv4" : "ipv6");
}

const guardedLookup: LookupFunction = (hostname, options, callback) => {
  dnsLookup(hostname, { ...options, all: true }, (error, result) => {
    if (error) return callback(error, "", 0);
    const addresses = result as LookupAddress[];
    if (
      addresses.length === 0 ||
      !addresses.every((a) => isPublicAddress(a.address))
    ) {
      return callback(
        Object.assign(new Error(`${hostname} does not resolve publicly`), {
          code: "EBLOCKED",
        }),
        "",
        0,
      );
    }
    if (options.all) {
      // The `all` overload is not expressed in LookupFunction's callback type.
      (callback as unknown as (e: null, a: LookupAddress[]) => void)(
        null,
        addresses,
      );
    } else {
      callback(null, addresses[0].address, addresses[0].family);
    }
  });
};

export type SafeFetchResult = {
  status: number;
  url: string;
  body: string;
  /** True when `maxBytes` cut the body short (only with `truncate`). */
  truncated: boolean;
};

/**
 * GETs a text resource over https, following at most `maxRedirects`
 * same-rules redirects. Bodies are only read for 2xx and are capped at
 * `maxBytes`: going over is an error, unless `truncate` asks for the part
 * that fit (enough for line-oriented formats like sitemaps).
 */
export async function safeFetchText(
  rawUrl: string,
  {
    userAgent,
    timeoutMs = 8_000,
    maxBytes = 3_000_000,
    maxRedirects = 3,
    truncate = false,
  }: {
    userAgent: string;
    truncate?: boolean;
    timeoutMs?: number;
    maxBytes?: number;
    maxRedirects?: number;
  },
): Promise<SafeFetchResult> {
  let url = new URL(rawUrl);
  const deadline = Date.now() + timeoutMs;

  for (let hop = 0; hop <= maxRedirects; hop++) {
    if (url.protocol !== "https:" || (url.port && url.port !== "443")) {
      throw new Error(`Refusing non-https URL: ${url.href}`);
    }
    if (isIP(url.hostname.replace(/^\[|\]$/g, "")) !== 0) {
      throw new Error("Refusing IP-literal URL");
    }

    const response = await getOnce(url, userAgent, deadline, {
      maxBytes,
      truncate,
    });
    const location = response.location;
    if (response.status >= 300 && response.status < 400 && location) {
      url = new URL(location, url);
      continue;
    }
    return {
      status: response.status,
      url: url.href,
      body: response.body,
      truncated: response.truncated,
    };
  }
  throw new Error("Too many redirects");
}

function getOnce(
  url: URL,
  userAgent: string,
  deadline: number,
  { maxBytes, truncate }: { maxBytes: number; truncate: boolean },
): Promise<{
  status: number;
  location?: string;
  body: string;
  truncated: boolean;
}> {
  return new Promise((resolve, reject) => {
    const remaining = deadline - Date.now();
    if (remaining <= 0) return reject(new Error("Timed out"));

    const request = https.get(
      url,
      {
        lookup: guardedLookup,
        headers: {
          "user-agent": userAgent,
          accept: "text/plain, application/xml, text/xml, */*;q=0.1",
          // No gzip, so `maxBytes` bounds what is actually read.
          "accept-encoding": "identity",
        },
      },
      (response) => {
        const status = response.statusCode ?? 0;
        if (status < 200 || status >= 300) {
          response.resume();
          return resolve({
            status,
            location: response.headers.location,
            body: "",
            truncated: false,
          });
        }

        const chunks: Buffer[] = [];
        let size = 0;
        const finish = (truncated: boolean) =>
          resolve({
            status,
            body: Buffer.concat(chunks).toString("utf8"),
            truncated,
          });
        response.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size <= maxBytes) {
            chunks.push(chunk);
          } else if (truncate) {
            chunks.push(chunk.subarray(0, chunk.length - (size - maxBytes)));
            finish(true);
            request.destroy();
          } else {
            request.destroy(new Error("Response too large"));
          }
        });
        response.on("end", () => finish(false));
        response.on("error", reject);
      },
    );
    // A wall-clock deadline: a socket idle timeout alone lets a slow drip of
    // bytes hold the request open indefinitely.
    const timer = setTimeout(
      () => request.destroy(new Error("Timed out")),
      remaining,
    );
    request.on("close", () => clearTimeout(timer));
    request.on("error", reject);
  });
}
