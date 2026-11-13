// apps/medusa/src/admin/lib/sdk.ts
// Medusa JS SDK client for the admin dashboard extensions.
//
// Every request made from admin UI code MUST go through this client — it
// attaches the admin session cookie / Authorization header automatically.
// A plain `fetch()` would be rejected as unauthenticated.
//
// `VITE_BACKEND_URL` is injected by the admin bundler (Vite); falling back to
// "/" makes the dashboard talk to the backend it is served from.
//
// `import.meta` is an ESM/Vite construct. This project type-checks as CommonJS
// (module: NodeNext with no "type": "module"), so tsc rejects the meta-property
// even though it never compiles this file — the admin bundle is built by Vite.
// Hence the two local suppressions below; the runtime code is exactly what the
// Medusa admin docs prescribe.
//
// Reference: ai/todo.md Phase 5

import Medusa from "@medusajs/js-sdk";

export const sdk = new Medusa({
	// @ts-expect-error — `import.meta` is resolved by Vite, not by tsc.
	baseUrl: import.meta.env.VITE_BACKEND_URL || "/",
	// @ts-expect-error — `import.meta` is resolved by Vite, not by tsc.
	debug: import.meta.env.DEV,
	auth: {
		type: "session",
	},
});
