// src/api/intentsky/publishable-key/route.ts
// POST /intentsky/publishable-key[?revoke=1] — the Intentsky console's
// "Rotate publishable key": creates a new storefront key linked to the
// default sales channel and, with revoke=1, revokes the other keys this
// engine created. Returns the new key so the console can store and show it.
//
// Authenticated with the connect token, never with admin credentials:
//   X-Intentsky-Timestamp: <ms since epoch>, within SIGNATURE_WINDOW_MS
//   X-Intentsky-Signature: HMAC-SHA256(token, `${ts}.POST.${path+query}`)
// A signature is accepted once (replay cache), and the comparison is
// constant-time. 404 when this deployment is not bound to a Project.

import type { MedusaRequest, MedusaResponse } from "@medusajs/framework";
import {
	intentskyConfig,
	requestMessage,
	SIGNATURE_WINDOW_MS,
	verifySignature,
} from "../../../lib/intentsky";
import { createStorefrontKey } from "../../../lib/intentsky-sync";

/** Signatures seen recently → the time they stop mattering. */
const seen = new Map<string, number>();

function replayed(signature: string, now: number): boolean {
	for (const [sig, until] of seen) if (until <= now) seen.delete(sig);
	if (seen.has(signature)) return true;
	seen.set(signature, now + SIGNATURE_WINDOW_MS * 2);
	return false;
}

function header(req: MedusaRequest, name: string): string {
	const v = req.headers[name];
	return Array.isArray(v) ? (v[0] ?? "") : (v ?? "");
}

export async function POST(req: MedusaRequest, res: MedusaResponse): Promise<void> {
	res.setHeader("Cache-Control", "no-store");
	const cfg = intentskyConfig();
	if (!cfg) {
		res.status(404).json({ ok: false, code: "not_configured", message: "Not connected to an Intentsky Project" });
		return;
	}

	const now = Date.now();
	const ts = Number(header(req, "x-intentsky-timestamp"));
	const signature = header(req, "x-intentsky-signature");
	if (!Number.isFinite(ts) || Math.abs(now - ts) > SIGNATURE_WINDOW_MS) {
		res.status(401).json({ ok: false, code: "stale_signature", message: "Request timestamp outside the accepted window" });
		return;
	}
	const message = requestMessage(ts, "POST", req.originalUrl);
	if (!/^[0-9a-f]{64}$/.test(signature) || !verifySignature(cfg.token, message, signature)) {
		res.status(401).json({
			ok: false,
			code: "invalid_signature",
			message: "Signature does not match this engine's INTENTSKY_CONNECT_TOKEN",
		});
		return;
	}
	if (replayed(signature, now)) {
		res.status(401).json({ ok: false, code: "replayed", message: "Signature already used" });
		return;
	}

	const key = await createStorefrontKey(req.scope, { revokeOthers: req.query.revoke === "1" });
	res.json({ ok: true, id: key.id, publishableKey: key.token });
}
