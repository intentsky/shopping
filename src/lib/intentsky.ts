// src/lib/intentsky.ts
// Intentsky connection — how this shop engine finds, proves itself to and
// stays known by the Intentsky Project it serves. Counterpart of
// apps/api/src/routes/shopping.ts in the Intentsky monorepo.
//
// Three environment variables bind a deployment to a Project:
//   INTENTSKY_PROJECT_ID     the Project id (shown in the Intentsky console)
//   INTENTSKY_CONNECT_TOKEN  a secret the console generated for this deployment
//   INTENTSKY_API_URL        the Intentsky API (default https://api.intentsky.com)
//
// Without them the engine runs as a plain Medusa; nothing here is called.
//
// The token itself travels once: to the Intentsky API, over HTTPS, when the
// deployment registers (lib/intentsky-sync.ts). Everything else is
// HMAC-SHA256 keyed with it, so neither side ever has to show the secret:
//   - Intentsky → GET /intentsky/handshake?nonce=…
//       we answer proof = HMAC(token, "handshake:" + nonce). Intentsky only
//       records a URL whose handshake proves it holds the token, so nobody
//       can point a Project at a server they do not run.
//   - Intentsky → POST /intentsky/publishable-key?revoke=1
//       signed with HMAC(token, `${ts}.POST.${path}`), ts within 5 minutes,
//       each signature accepted once (api/intentsky/publishable-key/route.ts).
//
// Medusa admin credentials are never involved: the key routes run inside the
// engine with the container, exactly like a `medusa exec` script would.

import { createHmac, timingSafeEqual } from "node:crypto";

/** Version of this template, reported to Intentsky at registration. */
export const TEMPLATE_VERSION = "1.0.0";

/** A signed request older (or newer) than this is refused. */
export const SIGNATURE_WINDOW_MS = 5 * 60_000;

export interface IntentskyConfig {
	apiUrl: string;
	projectId: string;
	token: string;
}

function clean(value: string | undefined): string {
	return (value ?? "").trim();
}

/** The connection settings, or null when this deployment is not bound to a Project. */
export function intentskyConfig(): IntentskyConfig | null {
	const projectId = clean(process.env.INTENTSKY_PROJECT_ID);
	const token = clean(process.env.INTENTSKY_CONNECT_TOKEN);
	if (!projectId || !token) return null;
	return {
		apiUrl: clean(process.env.INTENTSKY_API_URL || "https://api.intentsky.com").replace(/\/+$/, ""),
		projectId,
		token,
	};
}

/**
 * The URL the world reaches this engine at: MEDUSA_BACKEND_URL when it is a
 * real host, else Railway's injected public domain. null on a laptop without
 * either — registration is then skipped with a log line, nothing else changes.
 */
export function publicUrl(): string | null {
	const configured = clean(process.env.MEDUSA_BACKEND_URL).replace(/\/+$/, "");
	if (configured && !/^https?:\/\/(localhost|127\.0\.0\.1)(:|$)/.test(configured)) {
		return configured;
	}
	const railway = clean(process.env.RAILWAY_PUBLIC_DOMAIN);
	if (railway) return `https://${railway.replace(/^https?:\/\//, "").replace(/\/+$/, "")}`;
	return null;
}

/** Hex HMAC-SHA256 of `message` under `secret`. */
export function sign(secret: string, message: string): string {
	return createHmac("sha256", secret).update(message).digest("hex");
}

/** Constant-time check of a hex signature. */
export function verifySignature(secret: string, message: string, signature: string): boolean {
	const expected = Buffer.from(sign(secret, message), "utf8");
	const given = Buffer.from(String(signature ?? ""), "utf8");
	if (expected.length !== given.length) return false;
	return timingSafeEqual(expected, given);
}

/** The proof the handshake route returns for a nonce. */
export function handshakeProof(token: string, nonce: string): string {
	return sign(token, `handshake:${nonce}`);
}

/** What a signed Intentsky → engine request covers. `path` includes the query string. */
export function requestMessage(timestamp: number | string, method: string, path: string): string {
	return `${timestamp}.${method.toUpperCase()}.${path}`;
}
