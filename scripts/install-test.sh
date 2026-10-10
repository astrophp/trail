#!/usr/bin/env bash
#
# Fresh-application install test.
#
# Proves the product rule on a real application: `composer require astrophp/trail` plus
# `php artisan migrate`, and it records. Nothing else is done to the application: no provider
# registration, no config publish, no middleware, no trait.
#
# composer.lock is not checked: the package is a library and tracks none.
#
# Usage:
#   scripts/install-test.sh <12|13> [--lowest]
#
#   12 | 13     the Laravel major of the application that is created
#   --lowest    resolve the application with `composer update --prefer-lowest --prefer-stable`.
#               Only laravel/ai is verified to sit at its floor. The illuminate/* floors of the
#               package (^12.0|^13.0) are NOT reached: laravel/ai requires a newer framework, so
#               the framework resolves to a later release of the major (the run prints which).
#
# Environment:
#   KEEP_WORKDIR=1   keep the temporary directory (the archive, the application, its database)
#
# What is tested is `git archive HEAD`, extracted to a temporary directory and installed from there
# through a Composer `path` repository that copies instead of symlinking. That is the tree a tag
# produces, with .gitattributes export-ignore applied, so the test also fails when something the
# runtime needs is export-ignored. UNCOMMITTED CHANGES ARE NOT IN `git archive HEAD` and are not
# tested: commit first.
#
# What this cannot prove about a real Packagist install (covered by hand at release time):
#   - The dist zip. Packagist installs the zip GitHub builds for the tag; this installs a tar made
#     by `git archive` from the same rules, but not the zip itself.
#   - Version resolution. A path repository has no tag, so Composer reports a dev version here
#     (`dev-main`) and `require` needs `@dev`. Tag-to-version mapping, `^0.1` style constraints,
#     the stability flags and the version the dashboard shows for a tagged release are not covered.
#   - Packagist itself: package name registration, the auto-update hook and metadata caching.
#   - The state of the Laravel skeleton at release time: `create-project` resolves whatever the
#     newest 12.x or 13.x skeleton is today, so the result moves when the skeleton does.
#   - The illuminate/* floors the package declares (^12.0|^13.0). With --lowest the framework
#     resolves to whatever laravel/ai's own floor requires, a later release of the major.
#   - Databases other than SQLite, a web server (requests go through the application's HTTP
#     kernel, not a socket), queue workers and Octane.
#
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
STUBS="$ROOT/tests/Install/stubs"
PACKAGE=astrophp/trail

# The archive may hold exactly these top-level entries. Anything else fails the test, so a file
# that is added to the repository has to be either shipped on purpose or export-ignored.
ARCHIVE_ALLOWED="composer.json config database dist LICENSE README.md resources routes src stubs"
# Every one of these is needed at runtime or by Composer.
ARCHIVE_REQUIRED="composer.json LICENSE README.md config/trail.php routes/web.php src/TrailServiceProvider.php stubs/TrailServiceProvider.stub resources/views/layout.blade.php dist/app.js dist/app.css database/migrations"

usage() {
    sed -n '2,/^set -euo/p' "$0" | sed '$d' | sed 's/^# \{0,1\}//'
}

fail() {
    printf '\nFAIL: %s\n' "$*" >&2
    exit 1
}

step() {
    printf '\n== %s\n' "$*"
}

ok() {
    printf '   ok: %s\n' "$*"
}

MAJOR=${1:-}
LOWEST=0
case "$MAJOR" in
    12 | 13) ;;
    -h | --help) usage; exit 0 ;;
    *) usage >&2; exit 2 ;;
esac
shift
while [ $# -gt 0 ]; do
    case "$1" in
        --lowest) LOWEST=1 ;;
        *) usage >&2; exit 2 ;;
    esac
    shift
done

for tool in git composer php tar; do
    command -v "$tool" > /dev/null 2>&1 || fail "$tool is required and was not found"
done

if [ -n "$(git -C "$ROOT" status --porcelain)" ]; then
    printf 'note: the working tree has uncommitted changes; only `git archive HEAD` is tested.\n'
fi

WORK=$(mktemp -d "${TMPDIR:-/tmp}/trail-install.XXXXXX")
cleanup() {
    status=$?
    if [ "${KEEP_WORKDIR:-0}" = 1 ]; then
        printf '\nkept %s\n' "$WORK"
    else
        rm -rf "$WORK"
    fi
    exit $status
}
trap cleanup EXIT

PKG="$WORK/package"
APP="$WORK/app"
export COMPOSER_NO_INTERACTION=1

# Run a command quietly, and show its whole output only when it fails.
quiet() {
    local label=$1
    shift
    if ! "$@" > "$WORK/last.log" 2>&1; then
        cat "$WORK/last.log" >&2
        fail "$label"
    fi
}

# --------------------------------------------------------------------------------------------
# The package, as a tag would ship it
# --------------------------------------------------------------------------------------------

step "composer validate --strict --no-check-lock"
(cd "$ROOT" && composer validate --strict --no-check-lock) || fail "composer validate --strict failed"

step "Build the archive from HEAD ($(git -C "$ROOT" rev-parse --short HEAD))"
mkdir -p "$PKG"
git -C "$ROOT" archive --format=tar HEAD | tar -x -C "$PKG"

unexpected=""
for entry in $(cd "$PKG" && ls -A); do
    case " $ARCHIVE_ALLOWED " in
        *" $entry "*) ;;
        *) unexpected="$unexpected $entry" ;;
    esac
done
[ -z "$unexpected" ] || fail "the archive holds top-level entries that are not on the allowlist:$unexpected (export-ignore them in .gitattributes, or add them to ARCHIVE_ALLOWED if they should ship)"

for entry in $ARCHIVE_REQUIRED; do
    [ -e "$PKG/$entry" ] || fail "the archive is missing $entry, which the package needs at runtime (is it export-ignored?)"
done
for file in dist/app.js dist/app.css; do
    [ -s "$PKG/$file" ] || fail "the archive's $file is empty"
done
[ -n "$(ls "$PKG/database/migrations")" ] || fail "the archive has no migrations"
ls "$PKG/database/migrations" | grep -q '^20.*\.php$' || fail "the archive's database/migrations holds no migration file"

# One level down, where a directory is shipped whole: only what the runtime reads.
[ "$(cd "$PKG/resources" && ls -A)" = "views" ] || fail "the archive's resources/ must hold only views, found: $(cd "$PKG/resources" && ls -A | tr '\n' ' ')"
[ "$(cd "$PKG/database" && ls -A)" = "migrations" ] || fail "the archive's database/ must hold only migrations, found: $(cd "$PKG/database" && ls -A | tr '\n' ' ')"

# Nothing local or internal, wherever it sits.
leaks=$(cd "$PKG" && find . \( -name '.env*' -o -name 'CLAUDE*' -o -name '.claude' -o -name '.prototype' -o -name 'plans' -o -name '.DS_Store' -o -name '*.local.*' -o -name 'auth.json' -o -name '.git' -o -name '*.map' -o -name 'node_modules' -o -name 'vendor' \) -print)
[ -z "$leaks" ] || fail "the archive holds files that must never ship: $leaks"
ok "archive holds exactly: $(cd "$PKG" && ls -A | tr '\n' ' ')"

# --------------------------------------------------------------------------------------------
# A fresh Laravel $MAJOR application
# --------------------------------------------------------------------------------------------

step "Create a Laravel $MAJOR application"
quiet "composer create-project laravel/laravel:^$MAJOR.0 failed" \
    composer create-project "laravel/laravel:^$MAJOR.0" "$APP" --no-progress --no-ansi --prefer-dist

# The application's own state, before Trail: nothing of Trail is configured by hand from here on.
cd "$APP"
composer config repositories.trail --json "{\"type\":\"path\",\"url\":\"$PKG\",\"options\":{\"symlink\":false}}"

step "Require $PACKAGE from the archive"
if [ "$LOWEST" = 1 ]; then
    quiet "composer require $PACKAGE failed" composer require "$PACKAGE:@dev" --no-update --no-ansi
    quiet "composer update --prefer-lowest --prefer-stable failed (a floor that does not resolve or install is a finding, not something to patch here)" \
        composer update --prefer-lowest --prefer-stable --no-progress --no-ansi
else
    quiet "composer require $PACKAGE failed" composer require "$PACKAGE:@dev" --no-progress --no-ansi
fi

[ -d "$APP/vendor/$PACKAGE" ] || fail "vendor/$PACKAGE is missing after composer require"
[ ! -L "$APP/vendor/$PACKAGE" ] || fail "vendor/$PACKAGE is a symlink: the archive was not copied"
diff -r "$PKG" "$APP/vendor/$PACKAGE" > "$WORK/diff.log" 2>&1 || { cat "$WORK/diff.log" >&2; fail "vendor/$PACKAGE differs from the archive"; }

installed() {
    composer show "$1" --format=json --no-ansi | php -r '$d = json_decode(stream_get_contents(STDIN), true); echo $d["versions"][0] ?? "";'
}

AI_VERSION=$(installed laravel/ai)
FRAMEWORK_VERSION=$(installed laravel/framework)
TRAIL_VERSION=$(installed "$PACKAGE")
[ -n "$AI_VERSION" ] || fail "could not read the installed version of laravel/ai from composer"
[ -n "$FRAMEWORK_VERSION" ] || fail "could not read the installed version of laravel/framework from composer"
[ -n "$TRAIL_VERSION" ] || fail "could not read the installed version of $PACKAGE from composer"
ok "laravel/framework $FRAMEWORK_VERSION, laravel/ai $AI_VERSION, $PACKAGE $TRAIL_VERSION"

case "$FRAMEWORK_VERSION" in
    v$MAJOR.* | $MAJOR.*) ;;
    *) fail "laravel/framework $FRAMEWORK_VERSION is not a $MAJOR.x release" ;;
esac

if [ "$LOWEST" = 1 ]; then
    # The floors come from the package's own composer.json, so they are never written twice.
    # The installed version must equal the constraint's lower bound (^1.1 and ^1.1.0 both mean 1.1.0).
    php -r '
        $c = json_decode(file_get_contents($argv[1]), true);
        $floor = preg_replace("/^[^0-9]*/", "", explode("|", $c["require"]["laravel/ai"])[0]);
        $floor = implode(".", array_pad(array_slice(explode(".", $floor), 0, 3), 3, "0"));
        $installed = ltrim($argv[2], "v");
        if (version_compare($installed, $floor, "!=")) { fwrite(STDERR, "--prefer-lowest left laravel/ai at $installed, not on its floor $floor".PHP_EOL); exit(1); }
    ' "$ROOT/composer.json" "$AI_VERSION" || fail "laravel/ai is not on its floor"
    case "${FRAMEWORK_VERSION#v}" in
        $MAJOR.0.*) ;;
        *) printf '   note: laravel/framework resolved to %s, not %s.0.x: a dependency requires a newer release than the floor the package declares, so that floor itself is not exercised\n' "$FRAMEWORK_VERSION" "$MAJOR" ;;
    esac
fi

# Nothing of Trail was set up by hand.
[ ! -e "$APP/config/trail.php" ] || fail "config/trail.php exists before trail:install"
[ ! -e "$APP/app/Providers/TrailServiceProvider.php" ] || fail "a Trail provider exists before trail:install"
! grep -qi 'trail' "$APP/bootstrap/providers.php" || fail "bootstrap/providers.php mentions Trail before trail:install"

# --------------------------------------------------------------------------------------------
# What any application has: one agent, and a way to run it against the SDK's fake
# --------------------------------------------------------------------------------------------

mkdir -p "$APP/app/Ai/Agents" "$APP/app/Console/Commands"
cp "$STUBS/ProbeAgent.php" "$APP/app/Ai/Agents/ProbeAgent.php"
for command in ProbeRun ProbeRequest ProbeTraces ProbeTables ProbeRoutes; do
    cp "$STUBS/$command.php" "$APP/app/Console/Commands/$command.php"
done

# The database is a real SQLite file. What keeps the run offline is the SDK fake and the absent
# provider keys. The proxy below is only a backstop: an HTTP client that honours HTTP_PROXY would
# fail loudly instead of reaching a provider.
BASE_ENV=(
    "DB_CONNECTION=sqlite"
    "DB_DATABASE=$WORK/trail.sqlite"
    "ANTHROPIC_API_KEY="
    "OPENAI_API_KEY="
    "GEMINI_API_KEY="
    "HTTP_PROXY=http://127.0.0.1:9"
    "HTTPS_PROXY=http://127.0.0.1:9"
    "NO_PROXY="
)
: > "$WORK/trail.sqlite"

# artisan_env ASSIGNMENT args...  (ASSIGNMENT is one VAR=value; INSTALL_TEST=1 means "nothing extra")
artisan_env() {
    local assignment=$1
    shift
    (cd "$APP" && env "${BASE_ENV[@]}" "$assignment" php artisan --no-ansi "$@")
}

artisan() {
    artisan_env INSTALL_TEST=1 "$@"
}

# --------------------------------------------------------------------------------------------
# Assertions
# --------------------------------------------------------------------------------------------

# assert_runs N: Trail holds exactly N runs, each of the probe agent, completed, with its spans.
assert_runs() {
    local expected=$1
    artisan probe:traces > "$WORK/traces.json" 2> "$WORK/traces.err" || { cat "$WORK/traces.err" "$WORK/traces.json" >&2; fail "could not read Trail's tables"; }
    if ! php -r '
        $runs = json_decode(file_get_contents($argv[1]), true);
        $expected = (int) $argv[2];
        $problems = [];
        if (! is_array($runs) || count($runs) !== $expected) {
            $problems[] = "expected exactly $expected stored runs, found ".(is_array($runs) ? count($runs) : "unreadable output");
        } else {
            foreach ($runs as $i => $run) {
                $trace = $run["trace"];
                $spans = $run["spans"];
                if ($trace["type"] !== "agent") { $problems[] = "run $i: type is \"{$trace["type"]}\", expected \"agent\""; }
                if ($trace["agent_class"] !== "App\\Ai\\Agents\\ProbeAgent") { $problems[] = "run $i: agent_class is ".var_export($trace["agent_class"], true); }
                if ($trace["name"] !== "ProbeAgent") { $problems[] = "run $i: name is ".var_export($trace["name"], true).", expected \"ProbeAgent\""; }
                if ($trace["status"] !== "completed") { $problems[] = "run $i: status is \"{$trace["status"]}\", expected \"completed\""; }
                if ($trace["error_class"] !== null) { $problems[] = "run $i: error_class is ".var_export($trace["error_class"], true); }
                $types = array_map(fn ($span) => $span["type"], $spans);
                if ($types !== ["agent", "step"]) { $problems[] = "run $i: span types are [".implode(", ", $types)."], expected [agent, step]"; }
                if ((int) $trace["span_count"] !== count($spans)) { $problems[] = "run $i: span_count is {$trace["span_count"]} for ".count($spans)." stored spans"; }
                foreach ($spans as $span) {
                    if ($span["status"] !== "completed") { $problems[] = "run $i: the {$span["type"]} span is \"{$span["status"]}\", expected \"completed\""; }
                }
                $step = array_values(array_filter($spans, fn ($span) => $span["type"] === "step"))[0] ?? null;
                if ($step !== null && (int) $step["step_number"] !== 0) { $problems[] = "run $i: the step span is number ".var_export($step["step_number"], true).", expected 0"; }
            }
        }
        if ($problems !== []) {
            fwrite(STDERR, implode(PHP_EOL, $problems).PHP_EOL);
            exit(1);
        }
    ' "$WORK/traces.json" "$expected" 2> "$WORK/assert.err"; then
        cat "$WORK/assert.err" >&2
        printf -- '--- stored runs ---\n' >&2
        cat "$WORK/traces.json" >&2
        fail "$CASE: Trail's stored runs are not what a recording install holds"
    fi
    ok "$CASE: Trail holds exactly $expected run(s); every one is a completed ProbeAgent run with an agent span and step 0"
}

run_probe() {
    local assignment=${1:-INSTALL_TEST=1}
    artisan_env "$assignment" probe:run > "$WORK/run.out" 2>&1 || { cat "$WORK/run.out" >&2; fail "$CASE: the agent run failed (tracing must never break an AI call)"; }
    grep -q 'probe agent answered' "$WORK/run.out" || { cat "$WORK/run.out" >&2; fail "$CASE: the agent did not answer"; }
}

# request URI ASSIGNMENT: sets STATUS and TYPE, and leaves the body in $WORK/body.
request() {
    local uri=$1
    local assignment=${2:-INSTALL_TEST=1}
    : > "$WORK/body"
    artisan_env "$assignment" probe:request "$uri" "--body-to=$WORK/body" > "$WORK/request.out" 2>&1 || { cat "$WORK/request.out" >&2; fail "$CASE: the request for $uri crashed"; }
    STATUS=$(sed -n 's/^status=//p' "$WORK/request.out")
    TYPE=$(sed -n 's/^type=//p' "$WORK/request.out")
    [ -n "$STATUS" ] || { cat "$WORK/request.out" >&2; fail "$CASE: no status came back for $uri"; }
}

expect_status() {
    local uri=$1 wanted=$2 assignment=${3:-INSTALL_TEST=1}
    request "$uri" "$assignment"
    [ "$STATUS" = "$wanted" ] || { head -c 600 "$WORK/body" >&2; printf '\n' >&2; fail "$CASE: GET $uri answered $STATUS, expected $wanted"; }
}

# The dashboard answers 200 with the page, and the page carries the built script and styles inline.
assert_dashboard_served() {
    local assignment=${1:-INSTALL_TEST=1}
    expect_status /trail 200 "$assignment"
    case "$TYPE" in
        text/html*) ;;
        *) fail "$CASE: GET /trail answered the content type \"$TYPE\", expected HTML" ;;
    esac
    php -r '
        $body = file_get_contents($argv[1]);
        $js = file_get_contents($argv[2]);
        $css = file_get_contents($argv[3]);
        $problems = [];
        if (! str_contains($body, "<div id=\"trail\">")) { $problems[] = "the page has no mount point <div id=\"trail\">"; }
        if (! str_contains($body, $js)) { $problems[] = "the page does not inline dist/app.js (".strlen($js)." bytes) from the installed package"; }
        if (! str_contains($body, $css)) { $problems[] = "the page does not inline dist/app.css (".strlen($css)." bytes) from the installed package"; }
        if ($problems !== []) { fwrite(STDERR, implode(PHP_EOL, $problems).PHP_EOL); exit(1); }
    ' "$WORK/body" "$APP/vendor/$PACKAGE/dist/app.js" "$APP/vendor/$PACKAGE/dist/app.css" || fail "$CASE: GET /trail did not serve the built dashboard"
    ok "$CASE: GET /trail is 200 HTML with the mount point and the whole of dist/app.js and dist/app.css inlined"
}

# The API answers 200 JSON, knows about the stored runs, and reports the installed version.
assert_meta_served() {
    local assignment=${1:-INSTALL_TEST=1}
    expect_status /trail/api/meta 200 "$assignment"
    case "$TYPE" in
        application/json*) ;;
        *) fail "$CASE: GET /trail/api/meta answered the content type \"$TYPE\", expected JSON" ;;
    esac
    # The version is what Composer reports for the installed package; a path repository has no
    # tag, so it is a dev version here. It is compared with the lock file, an independent source.
    local locked
    locked=$(php -r '$lock = json_decode(file_get_contents($argv[1]), true); foreach ($lock["packages"] as $p) { if ($p["name"] === $argv[2]) { echo $p["version"]; } }' "$APP/composer.lock" "$PACKAGE")
    php -r '
        $meta = json_decode(file_get_contents($argv[1]), true);
        $locked = $argv[2];
        $problems = [];
        if (($meta["data"]["traces"]["any"] ?? null) !== true) { $problems[] = "data.traces.any is ".var_export($meta["data"]["traces"]["any"] ?? null, true).", expected true"; }
        $version = $meta["data"]["version"] ?? null;
        if (! is_string($version) || $version === "") { $problems[] = "data.version is ".var_export($version, true).", expected a string"; }
        elseif ($version !== $locked) { $problems[] = "data.version is \"$version\", but composer.lock holds \"$locked\""; }
        if ($problems !== []) { fwrite(STDERR, implode(PHP_EOL, $problems).PHP_EOL); exit(1); }
        echo $version;
    ' "$WORK/body" "$locked" > "$WORK/version.out" || fail "$CASE: GET /trail/api/meta is not what a recording install answers"
    ok "$CASE: GET /trail/api/meta is 200 JSON, traces.any is true, version is \"$(cat "$WORK/version.out")\" (as locked)"
}

# Denied: the request is refused with the given status, and no part of the dashboard is in the answer.
assert_refused() {
    local uri=$1 wanted=$2 assignment=$3
    expect_status "$uri" "$wanted" "$assignment"
    if grep -q '<div id="trail">' "$WORK/body"; then
        fail "$CASE: GET $uri answered $wanted but the body still holds the dashboard page"
    fi
    # Refused by Trail's own check, the API answers in JSON; with Trail off the route does not exist.
    if [ "$wanted" = 403 ]; then
        case "$uri" in
            /trail/api/*)
                case "$TYPE" in
                    application/json*) ;;
                    *) fail "$CASE: GET $uri answered $wanted as \"$TYPE\", expected JSON" ;;
                esac
                ;;
        esac
    fi
    ok "$CASE: GET $uri is $wanted"
}

# assert_tables: the trail_* tables are exactly the six the package ships. The list is explicit
# on purpose: derived from the archive's migrations it would shrink with a deleted migration and
# the check could never fail. A new table makes this fail until the list is updated.
EXPECTED_TABLES="trail_bookmarks trail_prices trail_spans trail_trace_models trail_trace_tools trail_traces"
assert_tables() {
    artisan probe:tables > "$WORK/tables.out" 2>&1 || { cat "$WORK/tables.out" >&2; fail "$CASE: could not list the tables"; }
    local found
    found=$(grep '^trail_' "$WORK/tables.out" | sort | tr '\n' ' ' | sed 's/ $//')
    [ "$found" = "$EXPECTED_TABLES" ] || fail "$CASE: the trail_* tables after migrate are [$found], expected [$EXPECTED_TABLES]"
    ok "$CASE: migrate created exactly: $found"
}

# assert_routes_registered yes|no ASSIGNMENT: whether the application has Trail's routes at all.
assert_routes_registered() {
    local wanted=$1 assignment=${2:-INSTALL_TEST=1}
    artisan_env "$assignment" probe:routes > "$WORK/routes.out" 2>&1 || { cat "$WORK/routes.out" >&2; fail "$CASE: could not list the routes"; }
    local count
    count=$(grep -c '^trail\.' "$WORK/routes.out" || true)
    if [ "$wanted" = yes ]; then
        if grep -q '^trail\.dashboard$' "$WORK/routes.out" && grep -q '^trail\.api\.meta$' "$WORK/routes.out"; then
            ok "$CASE: $count Trail routes are registered"
        else
            cat "$WORK/routes.out" >&2
            fail "$CASE: Trail's dashboard and meta routes are not registered"
        fi
    else
        [ "$count" = 0 ] || { cat "$WORK/routes.out" >&2; fail "$CASE: $count Trail routes are registered, expected none"; }
        ok "$CASE: no Trail route is registered"
    fi
}

# The API routes that read the tables other than traces and spans.
assert_api_reads_tables() {
    local uri
    for uri in /trail/api/prices /trail/api/usage /trail/api/traces /trail/api/agents /trail/api/overview; do
        expect_status "$uri" 200
        case "$TYPE" in
            application/json*) ;;
            *) fail "$CASE: GET $uri answered \"$TYPE\", expected JSON" ;;
        esac
    done
    ok "$CASE: prices, usage, traces, agents and overview answer 200 JSON"
}

# --------------------------------------------------------------------------------------------
# The flow
# --------------------------------------------------------------------------------------------

CASE="install"
step "php artisan migrate, then run the agent"
quiet "php artisan migrate failed" env "${BASE_ENV[@]}" php "$APP/artisan" migrate --force --no-ansi
assert_tables
assert_runs 0
assert_routes_registered yes
run_probe
assert_runs 1
assert_dashboard_served
assert_meta_served
assert_api_reads_tables

CASE="outside local, nobody listed in the gate"
step "$CASE (APP_ENV=production)"
run_probe APP_ENV=production
assert_runs 2
assert_refused /trail 403 APP_ENV=production
assert_refused /trail/api/meta 403 APP_ENV=production

CASE="TRAIL_ENABLED=false"
step "$CASE"
run_probe TRAIL_ENABLED=false
assert_runs 2 # unchanged: the run above recorded nothing
assert_routes_registered no TRAIL_ENABLED=false
assert_refused /trail 404 TRAIL_ENABLED=false
assert_refused /trail/api/meta 404 TRAIL_ENABLED=false

CASE="after trail:install"
step "php artisan trail:install"
artisan trail:install > "$WORK/install.out" 2>&1 || { cat "$WORK/install.out" >&2; fail "trail:install failed"; }
[ -f "$APP/config/trail.php" ] || fail "$CASE: trail:install did not publish config/trail.php"
[ -f "$APP/app/Providers/TrailServiceProvider.php" ] || fail "$CASE: trail:install did not publish the provider"
grep -q 'App\\Providers\\TrailServiceProvider::class' "$APP/bootstrap/providers.php" || fail "$CASE: trail:install did not register the provider in bootstrap/providers.php"
run_probe
assert_runs 3
assert_dashboard_served
assert_meta_served
CASE="after trail:install, outside local"
assert_refused /trail 403 APP_ENV=production
assert_refused /trail/api/meta 403 APP_ENV=production
CASE="after trail:install, TRAIL_ENABLED=false"
run_probe TRAIL_ENABLED=false
assert_runs 3
assert_routes_registered no TRAIL_ENABLED=false
assert_refused /trail 404 TRAIL_ENABLED=false

# Access outside local, granted the documented way: Trail::auth() in the application's own
# provider. Then the provider is put back and access is denied again, so both directions are shown.
CASE="outside local, access granted with Trail::auth"
PROVIDER="$APP/app/Providers/TrailServiceProvider.php"
cp "$PROVIDER" "$WORK/TrailServiceProvider.original"
php -r '
    $path = $argv[1];
    $code = file_get_contents($path);
    $method = "protected function authorization(): void\n    {\n        \\Astro\\Trail\\Facades\\Trail::auth(fn (\$request) => true);\n    }\n\n    ";
    $changed = preg_replace("/protected function gate\(\): void/", $method."protected function gate(): void", $code, 1, $count);
    if ($count !== 1) { fwrite(STDERR, "the published provider has no gate() to put the override before".PHP_EOL); exit(1); }
    file_put_contents($path, $changed);
' "$PROVIDER" || fail "$CASE: could not edit the published provider"
assert_dashboard_served APP_ENV=production
assert_meta_served APP_ENV=production
cp "$WORK/TrailServiceProvider.original" "$PROVIDER"
CASE="outside local, provider restored"
assert_refused /trail 403 APP_ENV=production
assert_refused /trail/api/meta 403 APP_ENV=production

printf '\nPASS: Laravel %s%s, %s, laravel/ai %s, %s %s\n' "$MAJOR" "$([ "$LOWEST" = 1 ] && printf ' (lowest)')" "$FRAMEWORK_VERSION" "$AI_VERSION" "$PACKAGE" "$TRAIL_VERSION"
