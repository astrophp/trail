#!/usr/bin/env bash
set -euo pipefail

tag=${1:-}
url=${PACKAGIST_URL:-https://repo.packagist.org/p2/astrophp/trail.json}
attempts=${PACKAGIST_ATTEMPTS:-20}
sleep_seconds=${PACKAGIST_SLEEP_SECONDS:-30}

case "$attempts" in ''|*[!0-9]*) printf 'PACKAGIST_ATTEMPTS must be a positive integer.\n' >&2; exit 2;; esac
[ "$attempts" -gt 0 ] || { printf 'PACKAGIST_ATTEMPTS must be a positive integer.\n' >&2; exit 2; }

for attempt in $(seq 1 "$attempts"); do
    metadata=$(curl --fail --silent --show-error --location "$url" 2>&1) && {
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
        printf 'Packagist does not list %s yet (attempt %s/%s).\n' "$tag" "$attempt" "$attempts" >&2
    }
    if [ "$attempt" -lt "$attempts" ]; then sleep "$sleep_seconds"; fi
done

printf 'GitHub release exists, but the Packagist hook did not deliver %s after %s attempts. See docs/releasing.md for the Packagist recovery steps.\n' "$tag" "$attempts" >&2
exit 1
