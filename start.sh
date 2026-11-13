#!/bin/sh
# Intentsky Shopping — container entrypoint (see Dockerfile).
#
#   1. database migrations (idempotent; also creates the store's defaults)
#   2. the first admin user, from MEDUSA_ADMIN_EMAIL / MEDUSA_ADMIN_PASSWORD
#      — Medusa's own CLI; "already exists" is not an error
#   3. bootstrap: a Region, the storefront API key, the Intentsky registration
#      (src/scripts/bootstrap.ts) — never fatal
#   4. the server
set -e

cd /app/.medusa/server

echo "[start] running database migrations"
npx medusa db:migrate

if [ -n "${MEDUSA_ADMIN_EMAIL}" ] && [ -n "${MEDUSA_ADMIN_PASSWORD}" ]; then
  echo "[start] ensuring the admin user ${MEDUSA_ADMIN_EMAIL} exists"
  npx medusa user --email "${MEDUSA_ADMIN_EMAIL}" --password "${MEDUSA_ADMIN_PASSWORD}" \
    || echo "[start] admin user already exists (or could not be created) — continuing"
else
  echo "[start] MEDUSA_ADMIN_EMAIL / MEDUSA_ADMIN_PASSWORD not set — no admin user created"
fi

echo "[start] bootstrap (region, storefront key, Intentsky registration)"
npx medusa exec ./src/scripts/bootstrap.js \
  || echo "[start] bootstrap failed — the heartbeat job will retry the registration"

# Opt-in sample catalogue (idempotent): set SHOPPING_SEED_EXAMPLE=1, redeploy,
# then remove the variable. Railway services have no shell by default, so a
# variable is the simplest way to run a one-off script.
if [ "${SHOPPING_SEED_EXAMPLE}" = "1" ]; then
  echo "[start] seeding the example catalogue (SHOPPING_SEED_EXAMPLE=1)"
  npx medusa exec ./src/scripts/seed-example-fasteners.js \
    || echo "[start] example seed failed — continuing"
fi

echo "[start] launching Medusa (mode=${MEDUSA_WORKER_MODE:-shared}, port=${PORT:-9000})"
exec npx medusa start
