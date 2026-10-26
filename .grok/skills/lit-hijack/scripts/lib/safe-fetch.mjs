// One SSRF-safe fetch for the skills that retrieve untrusted URLs. Every hop is re-validated:
// https only, the hostname must resolve (fail closed) to nothing but public addresses, at most
// five hops, and the body is streamed with a byte cap so an endless response cannot fill memory.
// The connection goes to the address the check approved: the lookup handed to the transport
// answers only with that address, so a name that answers again with a private address (DNS
// rebinding) cannot move it. TLS still verifies the certificate for the name.
// Refusals carry a uniform message that names no timing or port state, so a failure string is
// never a scan oracle. `fetchImpl` (an unpinned fetch-shaped stub), `requestImpl`
// (node:https's) and `dnsImpl` are injectable for tests; production passes the globals.
// Nothing here follows instructions from a fetched page: callers treat bytes as data.
import { lookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import { Readable } from "node:stream";

export const SAFE_FETCH_HOPS = 5;

const defaultDns = (host) => lookup(host, { all: true });

const v4Bytes = (ip) => {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  const bytes = parts.map((part) => (/^\d{1,3}$/u.test(part) ? Number(part) : -1));
  return bytes.every((byte) => byte >= 0 && byte <= 255) ? bytes : null;
};

const inSubnet = (bytes, base, bits) => {
  const full = Math.floor(bits / 8);
  const rest = bits % 8;
  for (let index = 0; index < full; index += 1) if (bytes[index] !== base[index]) return false;
  if (rest > 0 && (bytes[full] >> (8 - rest)) !== (base[full] >> (8 - rest))) return false;
  return true;
};

const v4Public = (bytes) => {
  const [first, second] = bytes;
  if (first === 10) return false;
  if (first === 172 && second >= 16 && second <= 31) return false;
  if (first === 192 && second === 168) return false;
  if (first === 127) return false;
  if (first === 169 && second === 254) return false;
  if (first === 0) return false;
  return true;
};

const v6Words = (ip) => {
  const halves = ip.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  if (halves.length === 1 && left.length !== 8) return null;
  if (left.length + right.length > 8) return null;
  const words = [...left, ...Array(8 - left.length - right.length).fill("0"), ...right];
  if (!words.every((word) => /^[0-9a-f]{1,4}$/iu.test(word))) return null;
  return words.map((word) => Number.parseInt(word, 16));
};

const v6Public = (words) => {
  if (words.every((word) => word === 0)) return false;
  if (words.every((word, index) => word === (index === 7 ? 1 : 0))) return false;
  if ((words[0] & 0xffc0) === 0xfe80) return false;
  if ((words[0] & 0xfe00) === 0xfc00) return false;
  return true;
};

/** True when the literal IP address is safe to connect to: not loopback, link-local, private,
// unspecified or ULA (IPv4-mapped IPv6 is judged as its IPv4 form). Anything unparseable is unsafe. */
export function isPublicAddress(ip) {
  if (typeof ip !== "string" || ip.length === 0) return false;
  if (isIP(ip) === 4) {
    const bytes = v4Bytes(ip);
    return bytes !== null && v4Public(bytes);
  }
  if (isIP(ip) === 6) {
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/u.exec(ip);
    if (mapped) {
      const bytes = v4Bytes(mapped[1]);
      return bytes !== null && v4Public(bytes);
    }
    const words = v6Words(ip.toLowerCase());
    return words !== null && v6Public(words);
  }
  return false;
}

const refused = (host, why) => new Error(`refused ${host}: ${why}`);

async function checkHost(host, dnsImpl) {
  let addresses;
  if (isIP(host) !== 0) {
    addresses = [{ address: host }];
  } else {
    try {
      addresses = await dnsImpl(host);
    } catch {
      throw refused(host, "the name does not resolve to a public address");
    }
  }
  if (!Array.isArray(addresses) || addresses.length === 0 || !addresses.every((entry) => entry && isPublicAddress(entry.address))) {
    throw refused(host, "the name does not resolve to a public address");
  }
  return addresses[0].address;
}

const pinnedSend = (requestImpl) => (href, { headers, signal }, { address }) => new Promise((resolveSend, rejectSend) => {
  const family = isIP(address);
  if (family === 0) {
    rejectSend(refused(address, "not a connectable address"));
    return;
  }
  const pin = (_host, options, callback) => {
    if (options?.all) callback(null, [{ address, family }]);
    else callback(null, address, family);
  };
  const req = requestImpl(href, { headers, signal, lookup: pin }, (res) => {
    const answer = new Headers();
    for (const [name, value] of Object.entries(res.headers ?? {})) {
      for (const item of [value].flat()) if (item !== undefined) answer.append(name, String(item));
    }
    const empty = [204, 205, 304].includes(res.statusCode);
    if (empty) res.resume();
    const body = empty ? null : {
      getReader() {
        const iterator = Readable.toWeb(res).getReader();
        return {
          read: () => iterator.read(),
          cancel: () => iterator.cancel(),
        };
      },
    };
    resolveSend({
      ok: res.statusCode >= 200 && res.statusCode < 300,
      status: res.statusCode,
      headers: answer,
      body,
      arrayBuffer: async () => new ArrayBuffer(0),
      url: href,
    });
  });
  req.on("error", rejectSend);
  req.end();
});

async function readCapped(response, url, limit, signal) {
  const declared = Number(response.headers?.get?.("content-length") ?? 0);
  if (Number.isFinite(declared) && declared > limit) throw new Error(`${url} is larger than ${limit} bytes`);
  const body = response.body;
  if (body && typeof body.getReader === "function") {
    const reader = body.getReader();
    const chunks = [];
    let total = 0;
    try {
      for (;;) {
        if (signal?.aborted) throw new Error(`${url} took too long`);
        const { done, value } = await reader.read();
        if (done) break;
        if (!value || value.length === 0) continue;
        total += value.length;
        if (total > limit) throw new Error(`${url} is larger than ${limit} bytes`);
        chunks.push(Buffer.from(value));
      }
    } finally {
      try {
        await reader.cancel();
      } catch {
        // The stream is already gone; the bytes read so far decide the outcome.
      }
    }
    return Buffer.concat(chunks, total);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > limit) throw new Error(`${url} is larger than ${limit} bytes`);
  return buffer;
}

/**
 * Fetch one URL with per-hop SSRF validation. Returns { buffer, contentType, finalUrl }.
 * Redirects (301/302/303/307/308) are followed manually, at most `hops` times, and each hop
 * repeats the https, DNS and address checks. `limit` caps the body; `timeoutMs` bounds the
 * whole call. Throws a `refused ...` error before any request to a non-public address.
 */
export async function safeFetch(startUrl, { limit, timeoutMs = 15_000, hops = SAFE_FETCH_HOPS, headers = {}, fetchImpl = null, requestImpl = httpsRequest, dnsImpl = defaultDns } = {}) {
  if (!Number.isFinite(limit) || limit <= 0) throw new Error("safeFetch needs a positive byte limit");
  const timeout = AbortSignal.timeout(timeoutMs);
  const send = fetchImpl ? ((href, init) => fetchImpl(href, init)) : pinnedSend(requestImpl);
  let current;
  try {
    current = new URL(startUrl);
  } catch {
    throw refused(String(startUrl), "not a fetchable link");
  }
  for (let hop = 0; hop <= hops; hop += 1) {
    if (current.protocol !== "https:") throw refused(current.host || String(startUrl), "only https links are fetched");
    const address = await checkHost(current.hostname, dnsImpl);
    const response = await send(current.href, { headers, redirect: "manual", signal: timeout }, { address });
    const status = response?.status ?? 0;
    if ([301, 302, 303, 307, 308].includes(status)) {
      const location = response.headers?.get?.("location");
      if (!location) throw new Error(`${current.href} redirected without a location`);
      if (hop === hops) throw new Error(`${current.href} redirected too many times`);
      try {
        current = new URL(location, current.href);
      } catch {
        throw refused(current.host, "the redirect target is not a fetchable link");
      }
      continue;
    }
    if (!(status >= 200 && status < 300)) throw new Error(`${current.href} answered HTTP ${status}`);
    const buffer = await readCapped(response, current.href, limit, timeout);
    return { buffer, contentType: response.headers?.get?.("content-type") ?? "", finalUrl: response.url ?? current.href };
  }
  throw new Error(`${startUrl} redirected too many times`);
}
