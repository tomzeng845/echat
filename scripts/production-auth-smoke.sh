#!/usr/bin/env bash
set -euo pipefail

base="http://127.0.0.1:2199"
log="/tmp/echat-production-auth-smoke.log"
account="prodfix$(date +%s)"

(
  cd "$(dirname "$0")/.."
  exec env -u ADMIN_TOTP_SECRET ASPNETCORE_ENVIRONMENT=Production PORT=2199 JWT_SECRET="production-smoke-jwt-secret" \
    dotnet Api/bin/Debug/net8.0/EChat.Api.dll >"$log" 2>&1
) &
pid=$!
cleanup() { kill "$pid" >/dev/null 2>&1 || true; wait "$pid" >/dev/null 2>&1 || true; }
trap cleanup EXIT

for _ in $(seq 1 30); do
  curl -fsS "$base/api/health" >/dev/null 2>&1 && break
  sleep 1
done
curl -fsS "$base/api/health" >/dev/null

response_file="$(mktemp)"
status="$(curl -sS -o "$response_file" -w '%{http_code}' "$base/api/auth/register" \
  -H 'Content-Type: application/json' \
  -d "{\"account\":\"$account\",\"password\":\"EChatTest2026x\",\"inviteCode\":\"ECHAT2026\",\"displayName\":\"生产认证回归\",\"agreementAccepted\":true,\"deviceName\":\"Production smoke\"}")"

if [[ "$status" != "200" ]] || ! grep -q '"success":true' "$response_file"; then
  echo "PRODUCTION_AUTH_FAILED status=$status body=$(cat "$response_file")" >&2
  tail -80 "$log" >&2
  exit 1
fi

admin_file="$(mktemp)"
admin_status="$(curl -sS -o "$admin_file" -w '%{http_code}' "$base/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"account":"E_Admin","password":"Heibai@99","deviceName":"Production preview admin smoke"}')"

if [[ "$admin_status" != "200" ]] || ! grep -q '"role":"Admin"' "$admin_file"; then
  echo "PRODUCTION_PREVIEW_ADMIN_FAILED status=$admin_status body=$(cat "$admin_file")" >&2
  tail -80 "$log" >&2
  exit 1
fi

echo "PRODUCTION_AUTH_OK account=$account status=$status preview_admin_status=$admin_status"
