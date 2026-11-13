// src/lib/intentsky-sync.ts
// Keeps this engine known to its Intentsky Project: makes sure a storefront
// (publishable) API key exists and registers URL + key with the Intentsky API.
// Runs at boot (scripts/bootstrap.ts) and every few hours (jobs/intentsky-heartbeat.ts),
// so a new Railway domain or a redeploy is picked up without anyone copying
// values around.
//
// The publishable key is what a storefront sends as `x-publishable-api-key`.
// It is public by design (it ships in browser bundles) — it only selects the
// sales channel — which is why it may be handed to Intentsky, and why the
// Intentsky console can show it to the Project Owner. Secret keys are never
// created here.

import type { Logger, MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import {
	createApiKeysWorkflow,
	createRegionsWorkflow,
	linkSalesChannelsToApiKeyWorkflow,
	revokeApiKeysWorkflow,
} from "@medusajs/medusa/core-flows";
import { intentskyConfig, publicUrl, TEMPLATE_VERSION } from "./intentsky";

/** Marks the keys this engine manages; the title shows in Settings → Publishable API keys. */
export const INTENTSKY_ACTOR = "intentsky";
export const INTENTSKY_KEY_TITLE = "Intentsky Shopping — storefront";

export interface StorefrontKey {
	id: string;
	token: string;
}

type ApiKeyLike = {
	id: string;
	token: string;
	type: string;
	created_by: string | null;
	revoked_at: Date | string | null;
};

export function logger(container: MedusaContainer): Logger {
	return container.resolve(ContainerRegistrationKeys.LOGGER);
}

/** The store's default sales channel — every publishable key must select one. */
export async function defaultSalesChannelId(container: MedusaContainer): Promise<string | null> {
	const storeModule = container.resolve(Modules.STORE);
	const [store] = await storeModule.listStores({}, { take: 1 });
	return store?.default_sales_channel_id ?? null;
}

/** The live publishable key this engine created earlier, if any. */
export async function findStorefrontKey(container: MedusaContainer): Promise<StorefrontKey | null> {
	const apiKeyModule = container.resolve(Modules.API_KEY);
	const keys = (await apiKeyModule.listApiKeys({ type: "publishable" })) as ApiKeyLike[];
	const live = keys.find((k) => k.created_by === INTENTSKY_ACTOR && !k.revoked_at);
	return live ? { id: live.id, token: live.token } : null;
}

/**
 * A fresh publishable key linked to the default sales channel. With
 * `revokeOthers` every other key this engine created is revoked — the
 * Intentsky console's "Rotate publishable key" after an incident.
 */
export async function createStorefrontKey(
	container: MedusaContainer,
	opts: { revokeOthers?: boolean } = {},
): Promise<StorefrontKey> {
	const { result } = await createApiKeysWorkflow(container).run({
		input: {
			api_keys: [
				{
					title: `${INTENTSKY_KEY_TITLE} (${new Date().toISOString().slice(0, 10)})`,
					type: "publishable",
					created_by: INTENTSKY_ACTOR,
				},
			],
		},
	});
	const created = result[0];
	if (!created) throw new Error("createApiKeysWorkflow returned no key");

	const salesChannelId = await defaultSalesChannelId(container);
	if (salesChannelId) {
		await linkSalesChannelsToApiKeyWorkflow(container).run({
			input: { id: created.id, add: [salesChannelId] },
		});
	}

	if (opts.revokeOthers) {
		const apiKeyModule = container.resolve(Modules.API_KEY);
		const keys = (await apiKeyModule.listApiKeys({ type: "publishable" })) as ApiKeyLike[];
		for (const k of keys) {
			if (k.id === created.id || k.created_by !== INTENTSKY_ACTOR || k.revoked_at) continue;
			await revokeApiKeysWorkflow(container).run({
				input: { selector: { id: k.id }, revoke: { revoked_by: INTENTSKY_ACTOR } },
			});
		}
	}

	return { id: created.id, token: created.token };
}

export async function ensureStorefrontKey(container: MedusaContainer): Promise<StorefrontKey> {
	return (await findStorefrontKey(container)) ?? (await createStorefrontKey(container));
}

/**
 * Carts, prices and checkout need a Region. A fresh database has none, so
 * one is created from SHOPPING_CURRENCY / SHOPPING_COUNTRIES (defaults: EUR
 * and the main EU markets). Existing regions are never touched.
 */
export async function ensureRegion(container: MedusaContainer): Promise<string | null> {
	const regionModule = container.resolve(Modules.REGION);
	const [existing] = await regionModule.listRegions({}, { take: 1 });
	if (existing) return existing.id;

	const currency = (process.env.SHOPPING_CURRENCY ?? "eur").trim().toLowerCase();
	const countries = (process.env.SHOPPING_COUNTRIES ?? "it,de,fr,es,nl,be,at,pt,ie")
		.split(",")
		.map((c) => c.trim().toLowerCase())
		.filter((c) => /^[a-z]{2}$/.test(c));
	const { result } = await createRegionsWorkflow(container).run({
		input: {
			regions: [
				{
					name: process.env.SHOPPING_REGION_NAME?.trim() || currency.toUpperCase(),
					currency_code: currency,
					countries,
					payment_providers: ["pp_system_default"],
				},
			],
		},
	});
	return result[0]?.id ?? null;
}

export interface RegisterResult {
	ok: boolean;
	status: number;
	message: string;
}

/**
 * POST {INTENTSKY_API_URL}/api/v1/shopping/connect — tells the Project where
 * this engine lives. Intentsky calls back GET /intentsky/handshake on that
 * URL before accepting it, so the engine must already be serving (the boot
 * script runs this right before `medusa start`; the heartbeat job repeats it
 * once the server is up, which is also when a first registration that raced
 * the server succeeds).
 */
export async function registerWithIntentsky(publishableKey: string | null): Promise<RegisterResult> {
	const cfg = intentskyConfig();
	if (!cfg) return { ok: false, status: 0, message: "INTENTSKY_PROJECT_ID / INTENTSKY_CONNECT_TOKEN not set" };
	const url = publicUrl();
	if (!url) return { ok: false, status: 0, message: "no public URL (MEDUSA_BACKEND_URL or RAILWAY_PUBLIC_DOMAIN)" };

	const body = {
		projectId: cfg.projectId,
		token: cfg.token,
		url,
		publishableKey,
		version: TEMPLATE_VERSION,
		medusa: medusaVersion(),
		railway: {
			projectId: process.env.RAILWAY_PROJECT_ID ?? null,
			serviceId: process.env.RAILWAY_SERVICE_ID ?? null,
			environmentId: process.env.RAILWAY_ENVIRONMENT_ID ?? null,
		},
	};

	try {
		const res = await fetch(`${cfg.apiUrl}/api/v1/shopping/connect`, {
			method: "POST",
			headers: { "Content-Type": "application/json", Accept: "application/json" },
			body: JSON.stringify(body),
			signal: AbortSignal.timeout(20_000),
		});
		const json = (await res.json().catch(() => ({}))) as { message?: string };
		return {
			ok: res.ok,
			status: res.status,
			message: json.message ?? (res.ok ? "registered" : res.statusText),
		};
	} catch (err) {
		return { ok: false, status: 0, message: err instanceof Error ? err.message : String(err) };
	}
}

function medusaVersion(): string | null {
	try {
		// eslint-disable-next-line @typescript-eslint/no-var-requires
		return (require("@medusajs/medusa/package.json") as { version?: string }).version ?? null;
	} catch {
		return null;
	}
}

/** Storefront key + registration, logged. Never throws: the shop must start regardless. */
export async function syncIntentsky(container: MedusaContainer): Promise<void> {
	const log = logger(container);
	if (!intentskyConfig()) {
		log.info("[intentsky] not connected to a Project (INTENTSKY_PROJECT_ID / INTENTSKY_CONNECT_TOKEN unset)");
		return;
	}
	let key: StorefrontKey | null = null;
	try {
		key = await ensureStorefrontKey(container);
	} catch (err) {
		log.error(`[intentsky] could not ensure the storefront key: ${err instanceof Error ? err.message : String(err)}`);
	}
	const result = await registerWithIntentsky(key?.token ?? null);
	if (result.ok) log.info(`[intentsky] registered with the Project (${result.message})`);
	else log.warn(`[intentsky] registration not accepted (${result.status || "network"}): ${result.message}`);
}
