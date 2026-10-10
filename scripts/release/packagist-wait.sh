#!/usr/bin/env bash
set -euo pipefail

tag=${1:-}
url=${PACKAGIST_URL:-https://repo.packagist.org/p2/astrophp/trail.json}
timeout_seconds=${PACKAGIST_TIMEOUT_SECONDS:-1200}
sleep_seconds=${PACKAGIST_SLEEP_SECONDS:-30}

# Packagist serves this file from a CDN with max-age=900, so allow well over 15 minutes.
for value in "$timeout_seconds" "$sleep_seconds"; do
    case "$value" in ''|*[!0-9]*) printf 'Packagist wait settings must be non-negative integers.\n' >&2; exit 2;; esac
done

deadline=$(($(date +%s) + timeout_seconds))
attempt=0

while :; do
    attempt=$((attempt + 1))
    poll_url=$url
    case "$url" in http*) poll_url="$url?cb=$(date +%s)";; esac
    metadata=$(curl --fail --silent --show-error --location "$poll_url" 2>&1) && {
        if printf '%s' "$metadata" | php -r '
            $tag = $argv[1]; $plain = substr($tag, 1);
            preg_match("/^(\\d+)\\.(\\d+)\\.(\\d+)(?:-(.+))?$/", $plain, $parts);
            $normalized = isset($parts[1]) ? "$parts[1].$parts[2].$parts[3].0".(!empty($parts[4]) ? "-$parts[4]" : "") : $plain;
            $data = json_decode(stream_get_contents(STDIN), true);
            foreach (($data["packages"] ?? []) as $versions) foreach ($versions as $package) {
                if (($package["version"] ?? "") === $tag || ($package["version"] ?? "") === $plain) exit(0);
                if (($package["version_normalized"] ?? "") === $tag || ($package["version_normalized"] ?? "") === $plain || strcasecmp(($package["version_normalized"] ?? ""), $normalized) === 0) exit(0);
            }
            exit(1);
        ' "$tag"; then
            printf 'Packagist lists %s.\n' "$tag"
            exit 0
        fi
        printf 'Packagist does not list %s yet (attempt %s).\n' "$tag" "$attempt" >&2
    }
    now=$(date +%s)
    if [ "$now" -ge "$deadline" ]; then break; fi
    pause=$((deadline - now))
    [ "$pause" -le "$sleep_seconds" ] || pause=$sleep_seconds
    sleep "$pause"
done

printf 'GitHub release exists, but Packagist does not list %s after %s attempts over %s seconds. See docs/releasing.md for the Packagist recovery steps.\n' "$tag" "$attempt" "$timeout_seconds" >&2
exit 1
