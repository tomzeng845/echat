#!/usr/bin/env python3
from __future__ import annotations

import argparse
import datetime as dt
import plistlib
import re
import sys
from pathlib import Path


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def validate_profile(path: Path, team_id: str, bundle_id: str) -> dict:
    with path.open("rb") as stream:
        profile = plistlib.load(stream)

    entitlements = profile.get("Entitlements", {})
    profile_uuid = profile.get("UUID", "")
    application_identifier = entitlements.get("application-identifier", "")
    _, separator, profile_bundle_id = application_identifier.partition(".")
    expiration = profile.get("ExpirationDate")

    require(re.fullmatch(r"[0-9A-Fa-f-]{36}", profile_uuid) is not None, "Provisioning profile UUID is invalid")
    require(team_id in profile.get("TeamIdentifier", []), "Provisioning profile Team ID does not match APPLE_TEAM_ID")
    require(separator == "." and profile_bundle_id == bundle_id, "Provisioning profile does not match the EChat Bundle ID")
    require(entitlements.get("aps-environment") == "production", "App Store IPA requires a production APNs profile")
    require(entitlements.get("get-task-allow") is False, "Development provisioning profiles are not accepted")
    require(not profile.get("ProvisionedDevices"), "Ad Hoc or development provisioning profiles are not accepted")
    require(not profile.get("ProvisionsAllDevices"), "Enterprise provisioning profiles are not accepted")
    require(isinstance(expiration, dt.datetime), "Provisioning profile expiration is missing")

    now = dt.datetime.now(dt.timezone.utc)
    if expiration.tzinfo is None:
        expiration = expiration.replace(tzinfo=dt.timezone.utc)
    require(expiration > now, "Provisioning profile is expired")

    return {
        "uuid": profile_uuid,
        "application_identifier": application_identifier,
        "expiration": expiration.isoformat(),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate an EChat App Store Connect provisioning profile plist")
    parser.add_argument("profile_plist", type=Path, help="Decoded provisioning profile plist")
    parser.add_argument("team_id", help="Expected Apple Team ID")
    parser.add_argument("bundle_id", help="Expected iOS Bundle ID")
    args = parser.parse_args()

    try:
        result = validate_profile(args.profile_plist, args.team_id, args.bundle_id)
    except (OSError, plistlib.InvalidFileException, ValueError) as error:
        print(f"APPLE_PROFILE_FAILED: {error}", file=sys.stderr)
        return 1

    print(
        "APPLE_PROFILE_OK "
        f"uuid={result['uuid']} "
        f"application_identifier={result['application_identifier']} "
        f"expiration={result['expiration']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
