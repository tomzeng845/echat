#!/usr/bin/env bash
set -euo pipefail
base="${1:-http://127.0.0.1:2099}"
suffix="$(date +%s)"
alice="alice${suffix}"
bob="bob${suffix}"
charlie="charlie${suffix}"
password='EChat.Test.2026!'

register() {
  curl -fsS "$base/api/auth/register" -H 'Content-Type: application/json' -d "{\"account\":\"$1\",\"password\":\"$password\",\"inviteCode\":\"ECHAT2026\",\"displayName\":\"$2\",\"agreementAccepted\":true,\"deviceName\":\"Smoke Test\"}"
}

alice_json="$(register "$alice" 'Alice')"
bob_json="$(register "$bob" 'Bob')"
charlie_json="$(register "$charlie" 'Charlie')"
alice_token="$(printf '%s' "$alice_json" | jq -r .accessToken)"
bob_token="$(printf '%s' "$bob_json" | jq -r .accessToken)"
charlie_token="$(printf '%s' "$charlie_json" | jq -r .accessToken)"
alice_id="$(printf '%s' "$alice_json" | jq -r .user.id)"
bob_id="$(printf '%s' "$bob_json" | jq -r .user.id)"
charlie_id="$(printf '%s' "$charlie_json" | jq -r .user.id)"

request_id="friend-$suffix"
curl -fsS "$base/api/contacts/requests" -H "Authorization: Bearer $alice_token" -H 'Content-Type: application/json' -d "{\"requestId\":\"$request_id\",\"peerAccount\":\"$bob\",\"note\":\"smoke\",\"source\":\"account\"}" >/dev/null
friend_request_id="$(curl -fsS "$base/api/contacts/requests" -H "Authorization: Bearer $bob_token" | jq -r '.[0].id')"
curl -fsS -X POST "$base/api/contacts/requests/$friend_request_id/accept" -H "Authorization: Bearer $bob_token" >/dev/null

curl -fsS "$base/api/contacts/requests" -H "Authorization: Bearer $alice_token" -H 'Content-Type: application/json' -d "{\"requestId\":\"friend-c-$suffix\",\"peerAccount\":\"$charlie\",\"note\":\"smoke\",\"source\":\"account\"}" >/dev/null
charlie_request_id="$(curl -fsS "$base/api/contacts/requests" -H "Authorization: Bearer $charlie_token" | jq -r '.[0].id')"
curl -fsS -X POST "$base/api/contacts/requests/$charlie_request_id/accept" -H "Authorization: Bearer $charlie_token" >/dev/null

conversation_json="$(curl -fsS "$base/api/conversations/direct" -H "Authorization: Bearer $alice_token" -H 'Content-Type: application/json' -d "{\"peerAccount\":\"$bob\",\"keyEnvelopes\":{\"$alice_id\":\"alice-envelope\",\"$bob_id\":\"bob-envelope\"}}")"
conversation_id="$(printf '%s' "$conversation_json" | jq -r .id)"
message_body="{\"clientMessageId\":\"same-$suffix\",\"kind\":\"Text\",\"ciphertext\":\"ciphertext\",\"nonce\":\"nonce\",\"algorithm\":\"AES-GCM-256\"}"
first="$(curl -fsS "$base/api/conversations/$conversation_id/messages" -H "Authorization: Bearer $alice_token" -H 'Content-Type: application/json' -d "$message_body")"
second="$(curl -fsS "$base/api/conversations/$conversation_id/messages" -H "Authorization: Bearer $alice_token" -H 'Content-Type: application/json' -d "$message_body")"
first_id="$(printf '%s' "$first" | jq -r .id)"
second_id="$(printf '%s' "$second" | jq -r .id)"
[[ "$first_id" == "$second_id" ]]
count="$(curl -fsS "$base/api/conversations/$conversation_id/messages?after=0&limit=100" -H "Authorization: Bearer $bob_token" | jq length)"
[[ "$count" == "1" ]]
curl -fsS -X POST "$base/api/conversations/$conversation_id/messages/$first_id/recall" -H "Authorization: Bearer $alice_token" >/dev/null
state="$(curl -fsS "$base/api/conversations/$conversation_id/messages?after=0&limit=100" -H "Authorization: Bearer $bob_token" | jq -r '.[0].state')"
[[ "$state" == "Recalled" ]]
curl -fsS -X POST "$base/api/conversations/$conversation_id/read/1" -H "Authorization: Bearer $bob_token" >/dev/null
read_sequence="$(curl -fsS "$base/api/conversations" -H "Authorization: Bearer $bob_token" | jq -r --arg id "$conversation_id" '.[] | select(.id == $id) | .readSequence')"
[[ "$read_sequence" == "1" ]]

group_id="$(curl -fsS "$base/api/conversations/groups" -H "Authorization: Bearer $alice_token" -H 'Content-Type: application/json' -d "{\"name\":\"Smoke Group\",\"memberAccounts\":[\"$bob\",\"$charlie\"],\"keyEnvelopes\":{\"$alice_id\":\"alice-envelope\",\"$bob_id\":\"bob-envelope\",\"$charlie_id\":\"charlie-envelope\"}}" | jq -r .id)"
group_count="$(curl -fsS "$base/api/conversations" -H "Authorization: Bearer $charlie_token" | jq -r --arg id "$group_id" '[.[] | select(.id == $id)] | length')"
[[ "$group_count" == "1" ]]

printf 'E2E_OK accounts=%s,%s,%s direct=%s group=%s idempotent_message=%s read=%s\n' "$alice" "$bob" "$charlie" "$conversation_id" "$group_id" "$first_id" "$read_sequence"
