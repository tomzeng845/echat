#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ANDROID_HOME="${ANDROID_HOME:-/home/ubuntu/android-sdk}"
JAVA_HOME="${JAVA_HOME:-/usr/lib/jvm/java-21-openjdk-amd64}"
export ANDROID_HOME JAVA_HOME

required=(
  ECHAT_ANDROID_KEYSTORE
  ECHAT_ANDROID_STORE_PASSWORD
  ECHAT_ANDROID_KEY_ALIAS
  ECHAT_ANDROID_KEY_PASSWORD
)
for name in "${required[@]}"; do
  if [[ -z "${!name:-}" ]]; then
    echo "Missing required signing variable: $name" >&2
    exit 2
  fi
done
if [[ ! -f "$ECHAT_ANDROID_KEYSTORE" ]]; then
  echo "Keystore not found: $ECHAT_ANDROID_KEYSTORE" >&2
  exit 2
fi

AAPT="$ANDROID_HOME/build-tools/36.0.0/aapt"
ZIPALIGN="$ANDROID_HOME/build-tools/36.0.0/zipalign"
APKSIGNER="$ANDROID_HOME/build-tools/36.0.0/apksigner"
BUNDLETOOL="${BUNDLETOOL:-$ANDROID_HOME/bundletool/bundletool-all-1.18.1.jar}"
for tool in "$AAPT" "$ZIPALIGN" "$APKSIGNER"; do
  if [[ ! -x "$tool" ]]; then
    echo "Android build tool not found: $tool" >&2
    exit 2
  fi
done
if [[ ! -s "$BUNDLETOOL" ]]; then
  echo "bundletool not found: $BUNDLETOOL" >&2
  exit 2
fi

cd "$ROOT"
pnpm android:sync
(
  cd android
  ./gradlew testReleaseUnitTest lintRelease bundleRelease assembleRelease
)

source_apk="$ROOT/android/app/build/outputs/apk/release/app-release.apk"
source_aab="$ROOT/android/app/build/outputs/bundle/release/app-release.aab"
[[ -s "$source_apk" ]] || { echo "Release APK was not generated" >&2; exit 3; }
[[ -s "$source_aab" ]] || { echo "Release AAB was not generated" >&2; exit 3; }

version_name="$($AAPT dump badging "$source_apk" | sed -n "s/.*versionName='\([^']*\)'.*/\1/p" | head -n 1)"
version_code="$($AAPT dump badging "$source_apk" | sed -n "s/.*versionCode='\([^']*\)'.*/\1/p" | head -n 1)"
application_id="$($AAPT dump badging "$source_apk" | sed -n "s/package: name='\([^']*\)'.*/\1/p" | head -n 1)"
[[ -n "$version_name" && -n "$version_code" && -n "$application_id" ]] || { echo "Unable to read APK metadata" >&2; exit 3; }

release_dir="$ROOT/releases"
mkdir -p "$release_dir"
apk="$release_dir/EChat-${version_name}-release.apk"
aab="$release_dir/EChat-${version_name}-release.aab"
info="$release_dir/EChat-${version_name}-release-info.txt"
checksums="$release_dir/EChat-${version_name}-release.sha256"
cp "$source_apk" "$apk"
cp "$source_aab" "$aab"

"$ZIPALIGN" -c -P 16 -v 4 "$apk" >/tmp/echat-release-zipalign.log
"$APKSIGNER" verify --verbose --print-certs "$apk" >/tmp/echat-release-apksigner.log
jarsigner -verify -verbose -certs "$aab" >/tmp/echat-release-jarsigner.log
grep -q '^jar verified' /tmp/echat-release-jarsigner.log || { echo "AAB JAR signature verification failed" >&2; exit 4; }

apk_cert_sha256="$(sed -n 's/^Signer #1 certificate SHA-256 digest: //p' /tmp/echat-release-apksigner.log | head -n 1)"
aab_manifest="$(java -jar "$BUNDLETOOL" dump manifest --bundle="$aab" --module=base)"
aab_manifest_root="$(printf '%s\n' "$aab_manifest" | head -n 1)"
aab_application_id="$(printf '%s\n' "$aab_manifest_root" | sed -n 's/.* package="\([^"]*\)".*/\1/p')"
aab_version_name="$(printf '%s\n' "$aab_manifest_root" | sed -n 's/.*android:versionName="\([^"]*\)".*/\1/p')"
aab_version_code="$(printf '%s\n' "$aab_manifest_root" | sed -n 's/.*android:versionCode="\([^"]*\)".*/\1/p')"
aab_cert_sha256="$(keytool -printcert -jarfile "$aab" | sed -n 's/^[[:space:]]*SHA256: //p' | tr -d ':' | tr '[:upper:]' '[:lower:]' | head -n 1)"
[[ "$application_id" == "$aab_application_id" ]] || { echo "APK/AAB application ID mismatch" >&2; exit 4; }
[[ "$version_name" == "$aab_version_name" ]] || { echo "APK/AAB version name mismatch" >&2; exit 4; }
[[ "$version_code" == "$aab_version_code" ]] || { echo "APK/AAB version code mismatch" >&2; exit 4; }
[[ "$apk_cert_sha256" == "$aab_cert_sha256" ]] || { echo "APK/AAB signing certificate mismatch" >&2; exit 4; }

(
  cd "$release_dir"
  sha256sum "$(basename "$apk")" "$(basename "$aab")" > "$(basename "$checksums")"
)

cat > "$info" <<EOF
EChat Android signed release
Application ID: $application_id
Version name: $version_name
Version code: $version_code
Minimum SDK: 24
Target SDK: 36
Signing alias: $ECHAT_ANDROID_KEY_ALIAS
Signing certificate SHA-256: $apk_cert_sha256
APK: $(basename "$apk")
AAB: $(basename "$aab")
Checksums: $(basename "$checksums")
APK alignment: 16 KB verified
APK signature: v2/v3 verified by apksigner
AAB signature: verified by jarsigner (self-signed Android release certificate)
AAB/APK certificate match: verified
API base URL: ${ECHAT_ANDROID_API_URL:-https://echatapp-favrlscm.manus.space}
EOF

printf 'SIGNED_ANDROID_RELEASE_OK app=%s version=%s(%s) cert=%s\n' "$application_id" "$version_name" "$version_code" "$apk_cert_sha256"
printf '%s\n%s\n%s\n%s\n' "$apk" "$aab" "$checksums" "$info"
