// src/admin/lib/tenant.ts
// Browser-side twin of src/lib/tenant.ts.
//
// The admin dashboard is bundled for the browser by Vite, so it cannot read
// process.env — only statically inlined VITE_* vars. Set
// VITE_SHOPPING_BRAND_NAME / VITE_SHOPPING_STOREFRONT_URL at build time to
// brand the dashboard copy; unset, the copy stays neutral.
//
// `import.meta` is an ESM/Vite construct. This project type-checks as CommonJS
// (module: NodeNext with no "type": "module"), so tsc rejects the meta-property
// even though it never compiles this file — the admin bundle is built by Vite.
// Same suppression as src/admin/lib/sdk.ts.

const viteEnv = // @ts-expect-error — `import.meta` is resolved by Vite, not by tsc.
	(import.meta.env ?? {}) as Record<string, string | undefined>;

function env(name: string, fallback: string): string {
	const value = viteEnv[name]?.trim();
	return value && value.length > 0 ? value : fallback;
}

/** Storefront origin without a trailing slash (empty when not configured). */
const storefrontUrl = env("VITE_SHOPPING_STOREFRONT_URL", "").replace(/\/+$/, "");
const storefrontHost = storefrontUrl.replace(/^https?:\/\//, "");

export const tenant = {
	/** Full display name, used in the reply templates the owner sends. */
	brand: env("VITE_SHOPPING_BRAND_NAME", storefrontHost || "our shop"),

	/** Public storefront origin, e.g. "https://shop.example.com". */
	storefrontUrl,

	/** Bare host, e.g. "shop.example.com" — for inline copy in the UI. */
	storefrontHost: storefrontHost || "the storefront",
} as const;
