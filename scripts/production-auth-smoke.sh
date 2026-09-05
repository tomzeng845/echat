#!/usr/bin/env bash
set -euo pipefail

base="http://127.0.0.1:2199"
log="/tmp/echat-production-auth-smoke.log"
account="prodfix$(date +%s)"

(
  cd "$(dirname "$0")/.."
  env -u ADMIN_TOTP_SECRET ASPNETCORE_ENVIRONMENT=Production PORT=2199 JWT_SECRET="production-smoke-jwt-secret" \
    dotnet run --no-build --project Api/EChat.Api.csproj >"$log" 2>&1
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

echo "PRODUCTION_AUTH_OK account=$account status=$status"
