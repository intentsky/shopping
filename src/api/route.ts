// src/api/route.ts
// GET / — the engine's front door. Medusa itself has no root page, so Express
// answered "Cannot GET /" to anyone opening the Railway URL — which reads as a
// broken deploy although /health, /app and /store all work. Browsers are sent
// to the admin; anything else (curl, uptime checks) gets a small JSON card
// saying where things are. No data, no auth, nothing to cache.

import type { MedusaRequest, MedusaResponse } from "@medusajs/framework";
import { intentskyConfig, TEMPLATE_VERSION } from "../lib/intentsky";

export function GET(req: MedusaRequest, res: MedusaResponse): void {
	res.setHeader("Cache-Control", "no-store");
	const accept = req.headers.accept;
	if ((Array.isArray(accept) ? accept.join(",") : (accept ?? "")).includes("text/html")) {
		res.redirect(302, "/app");
		return;
	}
	res.json({
		name: "Intentsky Shopping",
		version: TEMPLATE_VERSION,
		admin: "/app",
		health: "/health",
		store: "/store",
		intentsky: intentskyConfig() ? "connected" : "not connected",
		source: "https://github.com/intentsky/shopping",
	});
}
