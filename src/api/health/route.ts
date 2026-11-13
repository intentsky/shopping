// apps/medusa/src/api/health/route.ts
// GET /health — Health check endpoint for Railway, Render, and Caddy uptime monitoring.
//
// Returns HTTP 200 with a JSON payload when the server is running.
// Used by:
//   - Railway.app healthcheckPath in railway.toml
//   - Caddy reverse_proxy health_uri directive
//   - External uptime monitors (UptimeRobot, etc.)
//
// The response includes basic runtime info useful for diagnosing deployment issues:
//   status     — always "ok" when the process is healthy
//   uptime_s   — process uptime in seconds
//   timestamp  — current ISO timestamp (UTC)
//   version    — NODE_ENV for quick environment confirmation
//
// This endpoint intentionally does NOT check database connectivity — a DB outage
// should not cause Railway to restart the process (the process is healthy; the DB
// is temporarily unavailable). DB health is monitored separately.
//
// Reference: ai/todo.md Phase 8 §8.3

import type { MedusaRequest, MedusaResponse } from "@medusajs/framework";

// ---------------------------------------------------------------------------
// GET /health
// ---------------------------------------------------------------------------

export function GET(_req: MedusaRequest, res: MedusaResponse): void {
	res.status(200).json({
		status: "ok",
		service: "intentsky-shopping",
		env: process.env.NODE_ENV ?? "unknown",
		uptime_s: Math.floor(process.uptime()),
		timestamp: new Date().toISOString(),
	});
}
