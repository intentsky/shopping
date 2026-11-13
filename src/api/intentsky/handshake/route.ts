// src/api/intentsky/handshake/route.ts
// GET /intentsky/handshake?nonce=… — proves to Intentsky that the server at
// this URL holds the connect token of the Project it registers for.
//
// Intentsky generates the nonce, calls this on the URL the engine claimed at
// registration and compares `proof` with HMAC(token, "handshake:" + nonce).
// The token never leaves the process; the route reveals nothing else. 404
// when this deployment is not bound to a Project (see src/lib/intentsky.ts).

import type { MedusaRequest, MedusaResponse } from "@medusajs/framework";
import { handshakeProof, intentskyConfig, TEMPLATE_VERSION } from "../../../lib/intentsky";

const NONCE = /^[A-Za-z0-9_-]{8,128}$/;

export async function GET(req: MedusaRequest, res: MedusaResponse): Promise<void> {
	res.setHeader("Cache-Control", "no-store");
	const cfg = intentskyConfig();
	if (!cfg) {
		res.status(404).json({
			ok: false,
			code: "not_configured",
			message: "This engine is not connected to an Intentsky Project (set INTENTSKY_PROJECT_ID and INTENTSKY_CONNECT_TOKEN)",
		});
		return;
	}
	const nonce = typeof req.query.nonce === "string" ? req.query.nonce : "";
	if (!NONCE.test(nonce)) {
		res.status(400).json({ ok: false, message: "nonce required" });
		return;
	}
	res.json({
		ok: true,
		projectId: cfg.projectId,
		proof: handshakeProof(cfg.token, nonce),
		version: TEMPLATE_VERSION,
	});
}
