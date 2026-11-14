# Intentsky Shopping

A commerce engine for websites built on [Intentsky](https://intentsky.com) — and
for any site that wants a headless shop. It is [Medusa v2](https://medusajs.com)
(catalogue, carts, orders, customers, admin dashboard) with what a small shop
needs on top:

- **Quote requests (RFQ)** — `POST /store/shopping/inquiry` captures pre-sale
  inquiries (honeypot, hashed-IP rate limit, locale-aware confirmation emails),
  with an admin section at `/app/a/shopping-inquiries`. A shop can run quote-only,
  with no public prices, or sell with prices and Stripe.
- **Stripe** when `STRIPE_API_KEY` is set; **Resend** email when `RESEND_API_KEY`
  is set; **S3 / Cloudflare R2** media when `S3_*` is set (a Railway Volume
  otherwise).
- **One-step Intentsky connection** — paste two values from the Intentsky
  console at deploy; the engine registers itself, and the console shows the
  admin link and the storefront key, and can rotate that key later. No admin
  credentials ever leave the engine.

Adapted from [praveen-ks-2001/medusa-railway](https://github.com/praveen-ks-2001/medusa-railway)
by Intentsky ([intentsky.com](https://intentsky.com)). MIT licensed.

## Deploy on Railway

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/deploy/intentsky-shopping?referralCode=intentsky&utm_medium=integration&utm_source=button&utm_campaign=intentsky-shopping)

The template creates three services and a volume:

| Service | Source | Notes |
|---|---|---|
| `shopping` | this repo (Dockerfile) | Medusa API + admin at `/app`, health at `/health`, port 9000; `/` sends browsers to the admin |
| `Postgres` | Railway Postgres | `DATABASE_URL` is wired automatically |
| `Redis` | Railway Redis | `REDIS_URL` is wired automatically (`?family=0` for the IPv6 private network) |
| volume | mounted at `/app/.medusa/server/static` | uploaded media, unless `S3_*` is set |

At deploy, Railway asks for the variables marked **you** below; everything else
is generated. A first deploy takes about five minutes: build, migrations, the
admin user, then the server.

### Variables

| Variable | Who sets it | Meaning |
|---|---|---|
| `MEDUSA_ADMIN_EMAIL`, `MEDUSA_ADMIN_PASSWORD` | **you** | The first admin user, created at boot when missing. Change the password after the first login; the two variables can then be deleted. |
| `SHOPPING_STOREFRONT_URL` | **you** | Your shop's website (`https://…`). Drives the CORS defaults and the links in customer emails. |
| `INTENTSKY_PROJECT_ID`, `INTENTSKY_CONNECT_TOKEN` | **you** (from the Intentsky console) | Connects the engine to your Intentsky Project — see below. Leave empty to run unconnected. |
| `SHOPPING_BRAND_NAME`, `OWNER_EMAIL`, `EMAIL_FROM`, `OWNER_WHATSAPP` | you, optional | Store identity in emails and the admin. |
| `RESEND_API_KEY` | you, optional | Inquiry confirmations and owner notifications. Without it inquiries are saved, not mailed. |
| `STRIPE_API_KEY`, `STRIPE_WEBHOOK_SECRET` | you, optional | Card payments. Without them the shop is quote-only. |
| `S3_FILE_URL`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_BUCKET`, `S3_ENDPOINT`, `S3_REGION` | you, optional | S3-compatible media storage (AWS S3, Cloudflare R2, MinIO). |
| `SHOPPING_CURRENCY`, `SHOPPING_COUNTRIES`, `SHOPPING_REF_PREFIX` | you, optional | First Region of an empty database (default `eur`, main EU markets); prefix of inquiry references (default `INQ`). |
| `DATABASE_URL`, `REDIS_URL` | template | `${{Postgres.DATABASE_URL}}`, `${{Redis.REDIS_URL}}?family=0` |
| `JWT_SECRET`, `COOKIE_SECRET`, `IP_HASH_SALT` | template | `${{secret(64)}}` — never reuse across deployments |
| `MEDUSA_BACKEND_URL` | template | `https://${{RAILWAY_PUBLIC_DOMAIN}}` |
| `INTENTSKY_API_URL` | template | `https://api.intentsky.com` |
| `PORT`, `NODE_ENV`, `MEDUSA_WORKER_MODE` | template | `9000`, `production`, `shared` |

The full list with explanations is in [`.env.example`](./.env.example).

## Connect to an Intentsky Project

1. In the Intentsky console open your Project → **Shopping** and press
   **Generate connection token**. It is shown once.
2. Press **Deploy on Railway** there and paste `INTENTSKY_PROJECT_ID`,
   `INTENTSKY_CONNECT_TOKEN` and `SHOPPING_STOREFRONT_URL` into the template
   form, together with your admin email and password.
3. When the engine starts it calls `POST https://api.intentsky.com/api/v1/shopping/connect`.
   Intentsky calls back `GET /intentsky/handshake?nonce=…` on the URL the engine
   claimed and accepts it only if the answer proves the token
   (`HMAC-SHA256(token, "handshake:" + nonce)`). From then on the console shows
   the admin link, the storefront (publishable) key, and "last seen"; it can
   rotate the key with a signed request to `POST /intentsky/publishable-key`.

Websites built on Intentsky read the engine URL and key from the Project, so
nothing else has to be configured. A custom site sets `SHOPPING_BASE_URL` and
`MEDUSA_PUBLISHABLE_KEY` itself, or asks
`GET https://api.intentsky.com/api/v1/shopping/connection/public?project=<id>`
with its Signals Key (`X-ISK-Key`).

What Intentsky stores: the engine URL, the publishable key (public by design:
it ships in storefront bundles and only selects a sales channel), the template
version, Railway ids. Nothing else — not the admin password, not the database,
not Stripe.

## After the deploy

- **Admin**: `https://<your-domain>/app` — sign in with `MEDUSA_ADMIN_EMAIL` /
  `MEDUSA_ADMIN_PASSWORD`. Set up products, prices, shipping and taxes there.
- **Storefront key**: created at boot (Settings → Publishable API Keys,
  "Intentsky Shopping — storefront"), linked to the default sales channel.
- **Region**: one is created from `SHOPPING_CURRENCY` / `SHOPPING_COUNTRIES`
  when the database has none.
- **Sample data** (optional): set `SHOPPING_SEED_EXAMPLE=1`, let the service
  redeploy, then remove the variable — `start.sh` runs
  `src/scripts/seed-example-fasteners.ts` (idempotent): regions, categories and
  a quote-only fasteners catalogue, the first shop built on this engine.

## Rotating secrets

Railway disclosed on 2026-10-21 that customer environment variables may have
been read by a third party. Treat every variable as rotatable:

1. **Storefront key** — in the Intentsky console press *Rotate the storefront
   key* (or create a new publishable key in the admin and revoke the old one).
2. **Stripe** — roll the secret key and the webhook signing secret in the Stripe
   dashboard; update `STRIPE_API_KEY` / `STRIPE_WEBHOOK_SECRET` in Railway.
3. **Sessions** — set new `JWT_SECRET` and `COOKIE_SECRET` (any 64 random
   characters); every admin and customer session is signed out.
4. **Email / media / database** — rotate `RESEND_API_KEY`, the `S3_*`
   credentials and the Postgres password where they were issued; Railway
   rewires `DATABASE_URL` when you reset the database credentials.
5. **Intentsky connection** — generate a new token in the console and set
   `INTENTSKY_CONNECT_TOKEN`; the previous one stops working at once.
6. **Admin password** — change it in the admin; delete `MEDUSA_ADMIN_PASSWORD`
   from the variables (it is only read when no user exists).

Railway restarts the service on every variable change.

## Run locally

```bash
cp .env.example .env         # set DATABASE_URL (Postgres 15+), the rest is optional
npm install
npm run dev                  # http://localhost:9000, admin at /app
npx medusa user -e you@example.com -p a-long-password
npm run bootstrap            # region + storefront key (+ Intentsky registration if configured)
```

Production build, as the Dockerfile does it:

```bash
npm run build                       # → .medusa/server
cd .medusa/server && npm install --omit=dev
npx medusa db:migrate && npx medusa start
```

## What this repo adds to Medusa

| Path | Purpose |
|---|---|
| `src/modules/shopping-inquiry` | Inquiry (RFQ) data model, service, migration |
| `src/api/store/shopping/inquiry` | `POST` public inquiry endpoint (Zod-validated, rate-limited, honeypot) |
| `src/api/admin/shopping/inquiries` | Admin list / detail / stats |
| `src/admin/routes/a/shopping-inquiries`, `src/admin/widgets` | Admin UI section and dashboard widget |
| `src/workflows`, `src/subscribers/inquiry-created.ts` | Create/update inquiry workflows; confirmation + owner emails (Resend) |
| `src/api/intentsky/handshake`, `src/api/intentsky/publishable-key` | Intentsky connection (HMAC over the connect token) |
| `src/lib/intentsky.ts`, `src/lib/intentsky-sync.ts` | Connection config, signing, registration, storefront key |
| `src/scripts/bootstrap.ts`, `src/jobs/intentsky-heartbeat.ts` | Boot-time setup; 6-hourly re-registration |
| `src/api/health`, `src/api/route.ts` | `GET /health` for Railway's healthcheck; `GET /` → admin for browsers, a JSON card otherwise |
| `Dockerfile`, `start.sh` | Two-stage build; migrations → admin user → bootstrap → server |

## For template maintainers

The Railway template is composed in the Railway dashboard from this public
repository (Workspace → Templates → New Template): a service from
`https://github.com/intentsky/shopping` (Dockerfile build, healthcheck path
`/health`, public networking on, volume at `/app/.medusa/server/static`), a
Postgres and a Redis service, and the variables above with reference syntax
(`${{Postgres.DATABASE_URL}}`, `${{Redis.REDIS_URL}}?family=0`,
`${{secret(64)}}`, `https://${{RAILWAY_PUBLIC_DOMAIN}}`). Publishing it to the
marketplace makes it eligible for Railway's template kickbacks; answering
questions in the Template Queue raises the rate. Merges to `main` here notify
everyone who deployed it (updatable templates).

## License

[MIT](./LICENSE) — © 2026 Intentsky. Medusa is MIT licensed by Medusa.
