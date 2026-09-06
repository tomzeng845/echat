#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

required=(
  APPLE_TEAM_ID
  APP_STORE_CONNECT_KEY_ID
  APP_STORE_CONNECT_ISSUER_ID
  APP_STORE_CONNECT_API_KEY_PATH
)
for name in "${required[@]}"; do
  if [[ -z "${!name:-}" ]]; then
    printf 'Missing required environment variable: %s\n' "$name" >&2
    exit 2
  fi
done

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "TestFlight archive/upload requires macOS with Xcode 26 or newer." >&2
  exit 3
fi
command -v xcodebuild >/dev/null || { echo "xcodebuild is required" >&2; exit 3; }
command -v xcrun >/dev/null || { echo "xcrun is required" >&2; exit 3; }
command -v python3 >/dev/null || { echo "python3 is required for iOS project validation" >&2; exit 3; }
[[ -f "$APP_STORE_CONNECT_API_KEY_PATH" ]] || {
  echo "App Store Connect API key file was not found." >&2
  exit 2
}

BUNDLE_ID="${ECHAT_IOS_BUNDLE_ID:-com.echat.app}"
VERSION="${ECHAT_IOS_VERSION:-0.9.0}"
BUILD_NUMBER="${ECHAT_IOS_BUILD_NUMBER:-$(date -u +%Y%m%d%H%M%S)}"
API_URL="${ECHAT_IOS_API_URL:-https://echatapp-favrlscm.manus.space}"

XCODE_MAJOR="$(xcodebuild -version | awk 'NR == 1 { split($2, version, "."); print version[1] }')"
[[ "$XCODE_MAJOR" =~ ^[0-9]+$ && "$XCODE_MAJOR" -ge 26 ]] || {
  echo "Capacitor 8 requires Xcode 26 or newer." >&2
  exit 3
}
[[ "$APPLE_TEAM_ID" =~ ^[A-Za-z0-9]{10}$ ]] || { echo "APPLE_TEAM_ID must be a 10-character team ID." >&2; exit 2; }
[[ "$APP_STORE_CONNECT_KEY_ID" =~ ^[A-Za-z0-9]{10}$ ]] || { echo "APP_STORE_CONNECT_KEY_ID must be a 10-character key ID." >&2; exit 2; }
[[ "$APP_STORE_CONNECT_ISSUER_ID" =~ ^[A-Fa-f0-9-]{36}$ ]] || { echo "APP_STORE_CONNECT_ISSUER_ID must be a UUID." >&2; exit 2; }
[[ "$BUNDLE_ID" =~ ^[A-Za-z][A-Za-z0-9.-]+$ ]] || { echo "ECHAT_IOS_BUNDLE_ID is invalid." >&2; exit 2; }
[[ "$VERSION" =~ ^[0-9]+(\.[0-9]+){1,2}$ ]] || { echo "ECHAT_IOS_VERSION is invalid." >&2; exit 2; }
[[ "$BUILD_NUMBER" =~ ^[A-Za-z0-9.-]{1,18}$ ]] || { echo "ECHAT_IOS_BUILD_NUMBER is invalid." >&2; exit 2; }

DERIVED="$ROOT/build/ios-testflight"
ARCHIVE="$DERIVED/EChat.xcarchive"
EXPORT_DIR="$DERIVED/export"
EXPORT_OPTIONS="$DERIVED/ExportOptions.plist"
KEY_DIR="$HOME/.appstoreconnect/private_keys"
KEY_TARGET="$KEY_DIR/AuthKey_${APP_STORE_CONNECT_KEY_ID}.p8"

mkdir -p "$DERIVED" "$EXPORT_DIR" "$KEY_DIR" "$ROOT/releases"
chmod 700 "$KEY_DIR"
KEY_WAS_COPIED=false
if [[ "$(cd "$(dirname "$APP_STORE_CONNECT_API_KEY_PATH")" && pwd)/$(basename "$APP_STORE_CONNECT_API_KEY_PATH")" != "$KEY_TARGET" ]]; then
  cp "$APP_STORE_CONNECT_API_KEY_PATH" "$KEY_TARGET"
  KEY_WAS_COPIED=true
fi
chmod 600 "$KEY_TARGET"
cleanup() {
  if [[ "$KEY_WAS_COPIED" == true ]]; then rm -f "$KEY_TARGET"; fi
}
trap cleanup EXIT

export ECHAT_IOS_API_URL="$API_URL"
pnpm ios:validate
pnpm ios:sync

cat >"$EXPORT_OPTIONS" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key>
  <string>app-store-connect</string>
  <key>destination</key>
  <string>export</string>
  <key>signingStyle</key>
  <string>automatic</string>
  <key>teamID</key>
  <string>${APPLE_TEAM_ID}</string>
  <key>manageAppVersionAndBuildNumber</key>
  <false/>
  <key>stripSwiftSymbols</key>
  <true/>
  <key>uploadSymbols</key>
  <true/>
</dict>
</plist>
PLIST

rm -rf "$ARCHIVE" "$EXPORT_DIR"
mkdir -p "$EXPORT_DIR"

AUTH_FLAGS=(
  -allowProvisioningUpdates
  -authenticationKeyPath "$KEY_TARGET"
  -authenticationKeyID "$APP_STORE_CONNECT_KEY_ID"
  -authenticationKeyIssuerID "$APP_STORE_CONNECT_ISSUER_ID"
)

xcodebuild \
  -project ios/App/App.xcodeproj \
  -scheme App \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath "$ARCHIVE" \
  "${AUTH_FLAGS[@]}" \
  DEVELOPMENT_TEAM="$APPLE_TEAM_ID" \
  PRODUCT_BUNDLE_IDENTIFIER="$BUNDLE_ID" \
  MARKETING_VERSION="$VERSION" \
  CURRENT_PROJECT_VERSION="$BUILD_NUMBER" \
  clean archive

xcodebuild \
  -exportArchive \
  -archivePath "$ARCHIVE" \
  -exportPath "$EXPORT_DIR" \
  -exportOptionsPlist "$EXPORT_OPTIONS" \
  "${AUTH_FLAGS[@]}"

IPA="$(find "$EXPORT_DIR" -maxdepth 1 -name '*.ipa' -print -quit)"
[[ -n "$IPA" && -f "$IPA" ]] || { echo "Exported IPA was not found." >&2; exit 4; }

xcrun altool --validate-app \
  --file "$IPA" \
  --type ios \
  --apiKey "$APP_STORE_CONNECT_KEY_ID" \
  --apiIssuer "$APP_STORE_CONNECT_ISSUER_ID"

xcrun altool --upload-app \
  --file "$IPA" \
  --type ios \
  --apiKey "$APP_STORE_CONNECT_KEY_ID" \
  --apiIssuer "$APP_STORE_CONNECT_ISSUER_ID"

ARTIFACT="$ROOT/releases/EChat-iOS-${VERSION}-${BUILD_NUMBER}.ipa"
cp "$IPA" "$ARTIFACT"
shasum -a 256 "$ARTIFACT" >"${ARTIFACT}.sha256"
cat >"$ROOT/releases/EChat-iOS-${VERSION}-${BUILD_NUMBER}-upload.txt" <<INFO
bundleId=$BUNDLE_ID
version=$VERSION
build=$BUILD_NUMBER
api=$API_URL
archive=$ARCHIVE
ipa=$ARTIFACT
uploadedAtUtc=$(date -u +%Y-%m-%dT%H:%M:%SZ)
INFO

printf 'TESTFLIGHT_UPLOAD_OK bundle=%s version=%s build=%s ipa=%s\n' \
  "$BUNDLE_ID" "$VERSION" "$BUILD_NUMBER" "$ARTIFACT"
