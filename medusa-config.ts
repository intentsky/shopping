// medusa-config.ts — Intentsky Shopping (Medusa v2).
//
// Everything is driven by environment variables; see .env.example for the
// full list with explanations. On Railway they are the service variables
// (the template fills the generated ones: secrets, database, Redis, URL).
//
// Required in production:  DATABASE_URL, JWT_SECRET, COOKIE_SECRET
// Strongly recommended:    SHOPPING_STOREFRONT_URL (CORS + email links),
//                          MEDUSA_BACKEND_URL (or Railway's RAILWAY_PUBLIC_DOMAIN)
// Optional:                REDIS_URL, STRIPE_API_KEY (+ STRIPE_WEBHOOK_SECRET),
//                          RESEND_API_KEY, S3_* / R2_* media storage,
//                          INTENTSKY_* (connection to an Intentsky Project)

import { defineConfig, loadEnv, Modules } from "@medusajs/framework/utils";

loadEnv(process.env.NODE_ENV ?? "development", process.cwd());

/**
 * `medusa build` loads this file to bundle the admin; a Docker build has no
 * database and no secrets, so nothing is required until the engine actually
 * starts (start / develop / db:migrate / exec / user).
 */
const IS_BUILD = process.argv.includes("build");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function required(key: string): string {
	const value = process.env[key];
	if (!value) {
		throw new Error(
			`[medusa-config] Missing required environment variable: ${key}\n` +
				"  Copy .env.example to .env and fill it in (or set the service variable).",
		);
	}
	return value;
}

function optional(key: string, fallback = ""): string {
	const value = process.env[key];
	return value === undefined || value === "" ? fallback : value;
}

/** Comma-joined, de-duplicated, empty entries dropped. */
function origins(...values: (string | undefined)[]): string {
	const out: string[] = [];
	for (const v of values) {
		for (const part of (v ?? "").split(",")) {
			const origin = part.trim().replace(/\/+$/, "");
			if (origin && !out.includes(origin)) out.push(origin);
		}
	}
	return out.join(",");
}

const IS_PRODUCTION = process.env.NODE_ENV === "production";
const IS_TEST = process.env.NODE_ENV === "test";

// ---------------------------------------------------------------------------
// URLs
// ---------------------------------------------------------------------------

/** Where this engine is reached. Railway injects RAILWAY_PUBLIC_DOMAIN. */
const BACKEND_URL = (
	optional("MEDUSA_BACKEND_URL") ||
	(process.env.RAILWAY_PUBLIC_DOMAIN
		? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
		: "http://localhost:9000")
).replace(/\/+$/, "");

/** The shop's website (emails link to it; CORS allows it). */
const STOREFRONT_URL = optional("SHOPPING_STOREFRONT_URL").replace(/\/+$/, "");
const STOREFRONT_WWW = STOREFRONT_URL
	? STOREFRONT_URL.replace(/^(https?:\/\/)(?!www\.)/, "$1www.")
	: "";

const LOCAL_ORIGINS = IS_PRODUCTION
	? ""
	: "http://localhost:3000,http://localhost:3001,http://localhost:5173,http://localhost:7000,http://localhost:7001,http://localhost:8000,http://localhost:9000";

// ---------------------------------------------------------------------------
// Database / Redis
// ---------------------------------------------------------------------------

const DATABASE_URL =
	IS_TEST || IS_BUILD
		? optional("DATABASE_URL", "postgres://localhost:5432/intentsky_shopping_test")
		: required("DATABASE_URL");

// Railway's Redis is reached over the private IPv6 network: its URL needs
// `?family=0` for ioredis (the template appends it). Optional — without Redis
// the event bus and cache stay in memory, which is fine for one instance.
const REDIS_URL = optional("REDIS_URL");

// ---------------------------------------------------------------------------
// CORS — explicit values win; otherwise derived from the two URLs above.
// ---------------------------------------------------------------------------

const STORE_CORS = optional(
	"MEDUSA_STORE_CORS",
	origins(optional("STORE_CORS"), STOREFRONT_URL, STOREFRONT_WWW, LOCAL_ORIGINS),
);
const ADMIN_CORS = optional(
	"MEDUSA_ADMIN_CORS",
	origins(optional("ADMIN_CORS"), BACKEND_URL, LOCAL_ORIGINS),
);
const AUTH_CORS = optional(
	"MEDUSA_AUTH_CORS",
	origins(optional("AUTH_CORS"), STOREFRONT_URL, STOREFRONT_WWW, BACKEND_URL, LOCAL_ORIGINS),
);

// ---------------------------------------------------------------------------
// Media storage
// ---------------------------------------------------------------------------
// S3-compatible (AWS S3, Cloudflare R2, MinIO, …) when credentials are set;
// R2_* names are accepted as aliases. Otherwise files are written to `static`
// under the server directory — mount a persistent volume there on Railway
// (/app/.medusa/server/static), or uploads vanish on redeploy.

const S3_ACCESS_KEY_ID = optional("S3_ACCESS_KEY_ID") || optional("R2_ACCESS_KEY_ID");
const S3_SECRET_ACCESS_KEY = optional("S3_SECRET_ACCESS_KEY") || optional("R2_SECRET_ACCESS_KEY");
const S3_BUCKET = optional("S3_BUCKET") || optional("R2_BUCKET_NAME");
const S3_ENDPOINT =
	optional("S3_ENDPOINT") ||
	optional("R2_S3_URL") ||
	(process.env.R2_ACCOUNT_ID ? `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : "");
/** Public base URL of the bucket (custom domain or r2.dev) — built into every file URL. */
const S3_FILE_URL = optional("S3_FILE_URL") || optional("CDN_URL");

const fileProvider =
	S3_ACCESS_KEY_ID && S3_SECRET_ACCESS_KEY && S3_BUCKET && S3_FILE_URL
		? {
				resolve: "@medusajs/file-s3",
				id: "s3",
				options: {
					file_url: S3_FILE_URL,
					access_key_id: S3_ACCESS_KEY_ID,
					secret_access_key: S3_SECRET_ACCESS_KEY,
					region: optional("S3_REGION", "auto"),
					bucket: S3_BUCKET,
					...(S3_ENDPOINT ? { endpoint: S3_ENDPOINT } : {}),
					// R2 and most S3-compatible stores need path-style addressing.
					additional_client_config: {
						forcePathStyle: optional("S3_FORCE_PATH_STYLE", "true") !== "false",
					},
				},
			}
		: {
				resolve: "@medusajs/file-local",
				id: "local",
				options: {
					// Medusa serves `<server dir>/static` at /static.
					upload_dir: optional("MEDUSA_UPLOAD_DIR", "static"),
					backend_url: `${BACKEND_URL}/static`,
				},
			};

// ---------------------------------------------------------------------------
// Medusa config
// ---------------------------------------------------------------------------

export default defineConfig({
	projectConfig: {
		databaseUrl: DATABASE_URL,

		// "shared" runs API + background jobs in one process (the default and
		// what the Railway template deploys). "server" + "worker" split them.
		workerMode:
			(process.env.MEDUSA_WORKER_MODE as "server" | "worker" | "shared") ??
			"shared",

		...(REDIS_URL ? { redisUrl: REDIS_URL } : {}),

		http: {
			storeCors: STORE_CORS,
			adminCors: ADMIN_CORS,
			authCors: AUTH_CORS,
			jwtSecret:
				IS_PRODUCTION && !IS_BUILD
					? required("JWT_SECRET")
					: optional("JWT_SECRET", "dev-jwt-secret-change-in-production"),
			cookieSecret:
				IS_PRODUCTION && !IS_BUILD
					? required("COOKIE_SECRET")
					: optional("COOKIE_SECRET", "dev-cookie-secret-change-in-production"),
			// Medusa expects undefined to disable compression.
			compression: IS_PRODUCTION ? {} : undefined,
		},
	},

	admin: {
		// `true` only for a dedicated worker instance (MEDUSA_WORKER_MODE=worker).
		disable: optional("MEDUSA_DISABLE_ADMIN", optional("DISABLE_MEDUSA_ADMIN", "false")) === "true",
		path: "/app",
		// Empty = same-origin relative URLs. An absolute URL is baked into the
		// admin bundle at build time, so only set MEDUSA_ADMIN_BACKEND_URL when
		// the admin is served from a different host than the API.
		backendUrl: optional("MEDUSA_ADMIN_BACKEND_URL", ""),
	},

	modules: [
		{
			resolve: "@medusajs/file",
			key: Modules.FILE,
			options: { providers: [fileProvider] },
		},

		// Stripe only when a key is set — otherwise the shop is quote/RFQ-only
		// (no checkout) and the Payment module stays at Medusa's default.
		...(optional("STRIPE_API_KEY")
			? [
					{
						resolve: "@medusajs/payment",
						key: Modules.PAYMENT,
						options: {
							providers: [
								{
									resolve: "@medusajs/payment-stripe",
									id: "stripe",
									options: {
										apiKey: optional("STRIPE_API_KEY"),
										webhookSecret: optional("STRIPE_WEBHOOK_SECRET"),
										automatic_payment_methods: true,
										capture: true,
									},
								},
							],
						},
					},
				]
			: []),

		...(REDIS_URL
			? [
					{
						resolve: "@medusajs/event-bus-redis",
						key: Modules.EVENT_BUS,
						options: { redisUrl: REDIS_URL },
					},
					{
						resolve: "@medusajs/cache-redis",
						key: Modules.CACHE,
						options: { redisUrl: REDIS_URL, ttl: 1800 },
					},
				]
			: [
					{ resolve: "@medusajs/event-bus-local", key: Modules.EVENT_BUS },
					{
						resolve: "@medusajs/cache-inmemory",
						key: Modules.CACHE,
						options: { ttl: 900 },
					},
				]),

		// Intentsky Shopping — quote requests (RFQ): POST /store/shopping/inquiry,
		// /admin/shopping/*, the admin "Shopping" section.
		{ resolve: "./src/modules/shopping-inquiry" },
	],

	featureFlags: {
		product_categories: true,
		order_editing: true,
	},
} as any);
