<?php

use Symfony\Component\Process\Process;
use Symfony\Component\Yaml\Yaml;

function releaseRoot(): string
{
    return dirname(__DIR__, 3);
}

function releaseTemp(): string
{
    $path = sys_get_temp_dir().'/trail-release-'.bin2hex(random_bytes(6));
    mkdir($path);
    $GLOBALS['releaseTemps'][] = $path;

    return $path;
}

/**
 * @param  array<int, string>  $args
 * @param  array<string, string>  $env
 */
function releaseRun(string $script, array $args = [], array $env = [], ?string $cwd = null, ?string $input = null): Process
{
    $process = new Process([releaseRoot().'/scripts/release/'.$script, ...$args], $cwd ?? releaseRoot(), array_merge($_ENV, $env));
    if ($input !== null) {
        $process->setInput($input);
    }
    $process->run();

    return $process;
}

function releaseOutput(Process $process): string
{
    return $process->getOutput().$process->getErrorOutput();
}

function git(string $directory, string ...$args): string
{
    return trim((new Process(['git', ...$args], $directory))->mustRun()->getOutput());
}

function releaseRepo(array $files = []): string
{
    $directory = releaseTemp();
    git($directory, 'init', '--quiet', '--initial-branch=main');
    git($directory, 'config', 'user.email', 't@e');
    git($directory, 'config', 'user.name', 'T');
    foreach ($files as $name => $contents) {
        @mkdir(dirname("$directory/$name"), 0777, true);
        file_put_contents("$directory/$name", $contents);
        git($directory, 'add', $name);
    }
    git($directory, 'commit', '--quiet', '--allow-empty', '-m', 'main');

    return $directory;
}

function releaseClone(string $remote): string
{
    $directory = releaseTemp();
    (new Process(['git', 'clone', '--quiet', $remote, $directory.'/c']))->mustRun();
    git("$directory/c", 'config', 'user.email', 't@e');
    git("$directory/c", 'config', 'user.name', 'T');

    return "$directory/c";
}

function executable(string $path, string $body): string
{
    file_put_contents($path, "#!/bin/sh\n$body\n");
    chmod($path, 0755);

    return $path;
}

function runJson(string $status, ?string $conclusion = null, string $sha = 'abc'): string
{
    return json_encode(['workflow_runs' => [['head_sha' => $sha, 'head_branch' => 'main', 'event' => 'push', 'status' => $status, 'conclusion' => $conclusion]]], JSON_THROW_ON_ERROR);
}

function run(int $number, string $status, ?string $conclusion = null, int $attempt = 1): array
{
    return ['head_sha' => 'abc', 'head_branch' => 'main', 'event' => 'push', 'run_number' => $number, 'run_attempt' => $attempt, 'created_at' => '2026-10-10T10:00:00Z', 'status' => $status, 'conclusion' => $conclusion];
}

function runsJson(array $runs): string
{
    return json_encode(['workflow_runs' => $runs], JSON_THROW_ON_ERROR);
}

function workflow(): array
{
    return Yaml::parseFile(releaseRoot().'/.github/workflows/release.yml');
}

function workflowText(): string
{
    return file_get_contents(releaseRoot().'/.github/workflows/release.yml');
}

beforeEach(fn () => $GLOBALS['releaseTemps'] = []);
afterEach(function () {
    foreach ($GLOBALS['releaseTemps'] as $path) {
        (new Process(['rm', '-rf', $path]))->mustRun();
    }
});

it('validates tags and detects pre-releases', function (string $tag, bool $pre) {
    $process = releaseRun('tag-version.sh', [$tag]);
    expect($process->getExitCode())->toBe(0)->and($process->getOutput())->toContain('prerelease='.($pre ? 'true' : 'false'));
})->with([['v0.1.0', false], ['v10.20.30', false], ['v0.1.0-rc.1', true], ['v0.1.0-rc1', true], ['v0.1.0-RC2', true], ['v0.1.0-alpha1', true], ['v0.1.0-beta.3', true]]);

it('refuses invalid tags', function (string $tag) {
    $process = releaseRun('tag-version.sh', [$tag]);
    expect($process->getExitCode())->toBe(1)->and($process->getErrorOutput())->toContain('Invalid release tag');
})->with(['', 'v1.2', '0.1.0', 'vx', 'v0.1.0;echo', 'xv1.0.0', 'v1.0.0x', "v1.0.0\n", "v1.0.0\nv2.0.0", 'v1.0.0-foo', 'v1.0.0-dev', 'v1.0.0-patch1', 'v1.0.0-rc.', 'v1.0.0-rc', 'v1.0.0-beta', 'v1.0.0-alpha', 'v1.0.0-rc.1.2', 'v1.0.0-', 'v1.0.0.1', 'v1.0.0+build']);

it('matches changelog headings literally', function () {
    $file = releaseTemp().'/CHANGELOG.md';
    file_put_contents($file, "## v0x1y0\n\nNo.\n");
    $process = releaseRun('changelog-entry.sh', ['v0.1.0', $file]);
    expect($process->getExitCode())->toBe(1)->and($process->getErrorOutput())->toContain('no heading');
});

it('extracts only the requested dated changelog body', function () {
    $file = releaseTemp().'/CHANGELOG.md';
    file_put_contents($file, "## v0.1.0 - 2026-10-10\n\nFirst.\n\nSecond.\n\n## v0.0.9\n\nOld.\n");
    $process = releaseRun('changelog-entry.sh', ['v0.1.0', $file]);
    expect($process->getExitCode())->toBe(0)->and($process->getOutput())->toBe("First.\n\nSecond.\n");
});

it('refuses absent empty and similarly named changelog entries', function (string $tag, string $contents, string $message) {
    $file = releaseTemp().'/CHANGELOG.md';
    file_put_contents($file, $contents);
    $process = releaseRun('changelog-entry.sh', [$tag, $file]);
    expect($process->getExitCode())->toBe(1)->and($process->getErrorOutput())->toContain($message);
})->with([
    'longer version' => ['v0.1.0', "## v0.1.01\n\nNo.\n", 'no heading for v0.1.0'],
    'text instead of a date' => ['v0.1.0', "## v0.1.0 - soon\n\nNo.\n", 'no heading for v0.1.0'],
    'malformed date' => ['v0.1.0', "## v0.1.0 - 2026-1-1\n\nNo.\n", 'no heading for v0.1.0'],
    'date without spaces' => ['v0.1.0', "## v0.1.0 -2026-10-10\n\nNo.\n", 'no heading for v0.1.0'],
    'pre release heading' => ['v0.1.0', "## v0.1.0-rc.1\n\nNo.\n", 'no heading'],
    'stable heading' => ['v0.1.0-rc.1', "## v0.1.0\n\nNo.\n", 'no heading'],
    'trailing text' => ['v0.1.0', "## v0.1.0 later\n\nNo.\n", 'no heading'],
    'empty entry' => ['v0.1.0', "## v0.1.0\n\n## v0.0.9\n", 'entry for v0.1.0 has no release notes'],
]);

it('reads a CRLF changelog', function () {
    $file = releaseTemp().'/CHANGELOG.md';
    file_put_contents($file, "## v0.1.0 - 2026-10-10\r\n\r\nFirst.\r\n\r\n### Added\r\n\r\n- Second.\r\n\r\n## v0.0.9\r\n\r\nOld.\r\n");
    $process = releaseRun('changelog-entry.sh', ['v0.1.0', $file]);
    expect($process->getExitCode())->toBe(0)->and($process->getOutput())->toBe("First.\n\n### Added\n\n- Second.\n")->and($process->getOutput())->not->toContain("\r");
    file_put_contents($file, "## v0.1.0\r\n\r\nPlain.\r\n");
    expect(releaseRun('changelog-entry.sh', ['v0.1.0', $file])->getOutput())->toBe("Plain.\n");
});

it('names the tag when the changelog file is missing', function () {
    $process = releaseRun('changelog-entry.sh', ['v0.1.0', releaseTemp().'/none.md']);
    expect($process->getExitCode())->toBe(1)->and($process->getErrorOutput())->toContain('v0.1.0 needs release notes');
});

it('checks commits on main directly', function () {
    $directory = releaseRepo();
    $main = git($directory, 'rev-parse', 'HEAD');
    expect(releaseRun('on-main.sh', [$main, 'main'], [], $directory)->getExitCode())->toBe(0);
    git($directory, 'checkout', '--quiet', '-b', 'feature');
    git($directory, 'commit', '--quiet', '--allow-empty', '-m', 'feature');
    $process = releaseRun('on-main.sh', ['HEAD', 'main'], [], $directory);
    expect($process->getExitCode())->toBe(1)->and($process->getErrorOutput())->toContain('not an ancestor');
    $missing = releaseRun('on-main.sh', [$main, 'origin/main'], [], $directory);
    expect($missing->getExitCode())->toBe(1)->and($missing->getErrorOutput())->toContain('Cannot find origin/main');
});

it('classifies workflow runs with messages', function (string $input, int $code, string $message) {
    $process = releaseRun('runs-green.sh', ['tests.yml', 'abc', 'main'], [], null, $input);
    expect($process->getExitCode())->toBe($code)->and(releaseOutput($process))->toContain($message);
})->with([
    'success' => [runJson('completed', 'success'), 0, 'successful'],
    'failure' => [runJson('completed', 'failure'), 1, 'without success'],
    'cancelled' => [runJson('completed', 'cancelled'), 1, 'cancelled'],
    'in progress' => [runJson('in_progress'), 2, 'in_progress'],
    'none' => ['{"workflow_runs":[]}', 3, 'no push run'],
    'other sha' => [runJson('completed', 'success', 'other'), 3, 'no push run'],
    'other branch' => ['{"workflow_runs":[{"head_sha":"abc","head_branch":"feature","event":"push","status":"completed","conclusion":"success"}]}', 3, 'no push run'],
    'pull request run' => ['{"workflow_runs":[{"head_sha":"abc","head_branch":"main","event":"pull_request","status":"completed","conclusion":"success"}]}', 3, 'no push run'],
    'invalid json' => ['no', 1, 'invalid runs JSON'],
    'success then a later run in progress' => [runsJson([run(1, 'completed', 'success'), run(2, 'in_progress')]), 2, 'in_progress'],
    'failure then a later success' => [runsJson([run(1, 'completed', 'failure'), run(2, 'completed', 'success')]), 0, 'successful'],
    'success then a later failure' => [runsJson([run(1, 'completed', 'success'), run(2, 'completed', 'failure')]), 1, 'failure'],
    'success then a later cancelled run' => [runsJson([run(2, 'completed', 'cancelled'), run(1, 'completed', 'success')]), 1, 'cancelled'],
    'same run, higher attempt succeeds' => [runsJson([run(1, 'completed', 'failure', 1), run(1, 'completed', 'success', 2)]), 0, 'successful'],
    'same run, higher attempt fails' => [runsJson([run(1, 'completed', 'success', 1), run(1, 'completed', 'failure', 2)]), 1, 'failure'],
    'equal runs, one failure' => [runsJson([run(1, 'completed', 'success'), run(1, 'completed', 'failure')]), 1, 'failure'],
    'equal runs, one in progress' => [runsJson([run(1, 'completed', 'success'), run(1, 'queued')]), 2, 'queued'],
    'equal runs, both succeed' => [runsJson([run(1, 'completed', 'success'), run(1, 'completed', 'success')]), 0, 'successful'],
]);

function sequenceFetcher(string $directory, array $responses): string
{
    file_put_contents("$directory/source", implode("\n", $responses));

    return executable("$directory/fetch", 'count=0; [ -f "$RUNS_STATE" ] && count=$(cat "$RUNS_STATE"); count=$((count+1)); printf "%s" "$count" > "$RUNS_STATE"; printf "%s %s\n" "$1" "$2" >> "$RUNS_LOG"; sed -n "${count}p" "$RUNS_SOURCE"');
}

function waitEnv(string $directory, string $fetcher, array $extra = []): array
{
    return array_merge(['RELEASE_RUNS_FETCH_COMMAND' => $fetcher, 'RUNS_STATE' => "$directory/state", 'RUNS_LOG' => "$directory/log", 'RUNS_SOURCE' => "$directory/source", 'RELEASE_RUNS_TIMEOUT_SECONDS' => '5', 'RELEASE_RUNS_SLEEP_SECONDS' => '0', 'RELEASE_RUNS_GRACE_SECONDS' => '0'], $extra);
}

it('waits for runs and reports the outcome', function (array $responses, int $code, string $message) {
    $directory = releaseTemp();
    $fetcher = sequenceFetcher($directory, $responses);
    $process = releaseRun('wait-for-runs.sh', ['tests.yml', 'abc'], waitEnv($directory, $fetcher, ['RELEASE_RUNS_TIMEOUT_SECONDS' => '2']));
    expect($process->getExitCode())->toBe($code)->and(releaseOutput($process))->toContain($message);
})->with([
    'success after progress' => [[runJson('in_progress'), runJson('completed', 'success')], 0, 'successful'],
    'failure stops' => [[runJson('completed', 'failure')], 1, 'without success'],
]);

it('gives up after the deadline naming the workflow', function () {
    $directory = releaseTemp();
    $fetcher = sequenceFetcher($directory, array_fill(0, 50, runJson('in_progress')));
    $process = releaseRun('wait-for-runs.sh', ['tests.yml', 'abc'], waitEnv($directory, $fetcher, ['RELEASE_RUNS_TIMEOUT_SECONDS' => '0']));
    expect($process->getExitCode())->toBe(1)->and($process->getErrorOutput())->toContain('tests.yml did not finish')->and(file_get_contents("$directory/log"))->toBe("tests.yml abc\n");
});

it('honours an already-passed shared deadline', function () {
    $directory = releaseTemp();
    $fetcher = sequenceFetcher($directory, array_fill(0, 50, runJson('in_progress')));
    $process = releaseRun('wait-for-runs.sh', ['tests.yml', 'abc'], waitEnv($directory, $fetcher, ['RELEASE_RUNS_DEADLINE' => '1', 'RELEASE_RUNS_TIMEOUT_SECONDS' => '999']));
    expect($process->getExitCode())->toBe(1)->and(substr_count(file_get_contents("$directory/log"), "\n"))->toBe(1);
});

it('tolerates a run that does not exist yet only for the grace period', function () {
    $directory = releaseTemp();
    $fetcher = sequenceFetcher($directory, ['{"workflow_runs":[]}', runJson('completed', 'success')]);
    $process = releaseRun('wait-for-runs.sh', ['tests.yml', 'abc'], waitEnv($directory, $fetcher, ['RELEASE_RUNS_GRACE_SECONDS' => '30']));
    expect($process->getExitCode())->toBe(0);

    $directory = releaseTemp();
    $fetcher = sequenceFetcher($directory, array_fill(0, 5, '{"workflow_runs":[]}'));
    $process = releaseRun('wait-for-runs.sh', ['tests.yml', 'abc'], waitEnv($directory, $fetcher));
    expect($process->getExitCode())->toBe(1)->and($process->getErrorOutput())->toContain('never created a push run of tests.yml');
});

it('reports a failed run fetch with its own message', function () {
    $directory = releaseTemp();
    $fetcher = executable("$directory/fetch", "printf 'unavailable\\n' >&2\nexit 1");
    $process = releaseRun('wait-for-runs.sh', ['tests.yml', 'abc'], ['RELEASE_RUNS_FETCH_COMMAND' => $fetcher, 'RELEASE_RUNS_TIMEOUT_SECONDS' => '0']);
    expect($process->getExitCode())->toBe(1)->and($process->getErrorOutput())->toContain('unavailable')->and($process->getErrorOutput())->toContain('Could not query tests.yml');
});

it('keeps fetch stderr out of the runs JSON', function () {
    $directory = releaseTemp();
    $json = runJson('completed', 'success');
    $fetcher = executable("$directory/fetch", "printf 'a warning\\n' >&2\nprintf '%s' '$json'");
    $process = releaseRun('wait-for-runs.sh', ['tests.yml', 'abc'], ['RELEASE_RUNS_FETCH_COMMAND' => $fetcher, 'RELEASE_RUNS_TIMEOUT_SECONDS' => '0']);
    expect($process->getExitCode())->toBe(0)->and($process->getErrorOutput())->toContain('a warning');
});

it('requires both tests.yml and install.yml', function () {
    $directory = releaseTemp();
    $fetcher = executable("$directory/fetch", 'printf "%s\n" "$1" >> "$RUNS_LOG"; printf \'{"workflow_runs":[{"head_sha":"%s","head_branch":"main","event":"push","status":"completed","conclusion":"success"}]}\' "$2"');
    $process = releaseRun('wait-for-checks.sh', ['abc'], ['RELEASE_RUNS_FETCH_COMMAND' => $fetcher, 'RUNS_LOG' => "$directory/log", 'RELEASE_RUNS_TIMEOUT_SECONDS' => '0']);
    expect($process->getExitCode())->toBe(0)->and(file_get_contents("$directory/log"))->toBe("tests.yml\ninstall.yml\n");

    $failing = executable("$directory/fail", 'if [ "$1" = install.yml ]; then printf \'{"workflow_runs":[]}\'; else printf \'{"workflow_runs":[{"head_sha":"%s","head_branch":"main","event":"push","status":"completed","conclusion":"success"}]}\' "$2"; fi');
    $process = releaseRun('wait-for-checks.sh', ['abc'], ['RELEASE_RUNS_FETCH_COMMAND' => $failing, 'RELEASE_RUNS_TIMEOUT_SECONDS' => '0', 'RELEASE_RUNS_GRACE_SECONDS' => '0']);
    expect($process->getExitCode())->toBe(1)->and($process->getErrorOutput())->toContain('install.yml');
});

it('shares one deadline between the two workflows', function () {
    $directory = releaseTemp();
    $fetcher = executable("$directory/fetch", 'printf "%s\n" "$1" >> "$RUNS_LOG"; printf \'{"workflow_runs":[{"head_sha":"%s","head_branch":"main","event":"push","status":"queued"}]}\' "$2"');
    $process = releaseRun('wait-for-checks.sh', ['abc'], ['RELEASE_RUNS_FETCH_COMMAND' => $fetcher, 'RUNS_LOG' => "$directory/log", 'RELEASE_RUNS_TIMEOUT_SECONDS' => '0']);
    expect($process->getExitCode())->toBe(1)->and(file_get_contents("$directory/log"))->toBe("tests.yml\n");
});

it('reads the Packagist metadata with exact versions', function (string $tag, string $listed, int $code) {
    $file = releaseTemp().'/metadata';
    file_put_contents($file, json_encode(['packages' => ['astrophp/trail' => [['version' => $listed]]]]));
    $process = releaseRun('packagist-wait.sh', [$tag], ['PACKAGIST_URL' => "file://$file", 'PACKAGIST_TIMEOUT_SECONDS' => '0', 'PACKAGIST_SLEEP_SECONDS' => '0']);
    expect($process->getExitCode())->toBe($code);
})->with([['v0.1.0', 'v0.1.0', 0], ['v0.1.0', 'v0.1.0.1', 1], ['v0.1.0', 'dev-main', 1], ['v0.1.0', 'v0.1.0-rc.1', 1], ['v0.1.0-rc.1', 'v0.1.0', 1], ['v0.1.0-rc.1', 'v0.1.0-rc.1', 0]]);

it('handles unavailable and normalized Packagist metadata', function () {
    $bad = releaseRun('packagist-wait.sh', ['v0.1.0'], ['PACKAGIST_URL' => 'file:///missing-release-metadata', 'PACKAGIST_TIMEOUT_SECONDS' => '0']);
    expect($bad->getExitCode())->toBe(1)->and($bad->getErrorOutput())->toContain('does not list v0.1.0');
    $file = releaseTemp().'/metadata';
    file_put_contents($file, json_encode(['packages' => ['astrophp/trail' => [['version_normalized' => '0.1.0.0']]]]));
    expect(releaseRun('packagist-wait.sh', ['v0.1.0'], ['PACKAGIST_URL' => "file://$file", 'PACKAGIST_TIMEOUT_SECONDS' => '0'])->getExitCode())->toBe(0);
});

it('says why Packagist did not list the version', function (string $body, string $url, string $reason) {
    $directory = releaseTemp();
    if ($body !== '') {
        file_put_contents("$directory/metadata", $body);
    }
    $process = releaseRun('packagist-wait.sh', ['v0.1.0'], ['PACKAGIST_URL' => $url === '' ? "file://$directory/metadata" : $url, 'PACKAGIST_TIMEOUT_SECONDS' => '0']);
    expect($process->getExitCode())->toBe(1)->and($process->getErrorOutput())->toContain($reason)->and($process->getErrorOutput())->toContain('Last reason: '.$reason);
})->with([
    'missing package' => ['', 'file:///missing-release-metadata', 'the package is not on Packagist yet (HTTP 404)'],
    'invalid json' => ['<html>', '', 'the Packagist response is not valid JSON'],
    'version not listed' => ['{"packages":{"astrophp/trail":[{"version":"v0.0.9"}]}}', '', 'the Packagist metadata does not list v0.1.0'],
]);

it('polls Packagist with a cache-busting query and retries until listed', function () {
    $directory = releaseTemp();
    mkdir("$directory/bin");
    $metadata = json_encode(['packages' => ['astrophp/trail' => [['version' => 'v0.1.0']]]]);
    executable("$directory/bin/curl", 'n=0; [ -f "$CURL_STATE" ] && n=$(cat "$CURL_STATE"); n=$((n+1)); printf "%s" "$n" > "$CURL_STATE"; for last; do :; done; printf "%s\n" "$last" >> "$CURL_LOG"; if [ "$n" -lt 2 ]; then printf "{}"; else printf \'%s\' \''.$metadata.'\'; fi');
    $process = releaseRun('packagist-wait.sh', ['v0.1.0'], ['PATH' => "$directory/bin:".getenv('PATH'), 'CURL_STATE' => "$directory/n", 'CURL_LOG' => "$directory/urls", 'PACKAGIST_URL' => 'https://repo.packagist.org/p2/astrophp/trail.json', 'PACKAGIST_TIMEOUT_SECONDS' => '5', 'PACKAGIST_SLEEP_SECONDS' => '0']);
    $urls = file($directory.'/urls', FILE_IGNORE_NEW_LINES);
    expect($process->getExitCode())->toBe(0)->and($urls)->toHaveCount(2)->and($urls[0])->toMatch('#^https://repo\.packagist\.org/p2/astrophp/trail\.json\?cb=\d+$#');
});

it('encodes and decodes multi-line notes unchanged', function () {
    $notes = "Intro `code` and \$(touch /tmp/never) \"quoted\" 'single' \\ back\n\n- Zażółć gęślą jaźń 日本語 🚀\n- \$HOME \${x}\n";
    $directory = releaseTemp();
    file_put_contents("$directory/CHANGELOG.md", "## v0.1.0 - 2026-10-10\n\n$notes\n## v0.0.9\n\nOld.\n");
    $entry = releaseRun('changelog-entry.sh', ['v0.1.0', "$directory/CHANGELOG.md"]);
    expect($entry->getOutput())->toBe($notes);
    $encoded = releaseRun('encode-notes.sh', [], [], null, $entry->getOutput());
    expect($encoded->getExitCode())->toBe(0)->and($encoded->getOutput())->toMatch('/^notes=[A-Za-z0-9+\/=]+\n$/');
    $decoded = releaseRun('decode-notes.sh', ["$directory/out.md"], ['NOTES' => substr(trim($encoded->getOutput()), 6)]);
    expect($decoded->getExitCode())->toBe(0)->and(file_get_contents("$directory/out.md"))->toBe($notes);
});

it('refuses empty notes when decoding', function () {
    $process = releaseRun('decode-notes.sh', [releaseTemp().'/out.md'], ['NOTES' => '']);
    expect($process->getExitCode())->toBe(1);
});

it('detects an existing release including drafts', function (string $listing, int $code) {
    $process = releaseRun('release-exists.sh', ['v0.1.0'], [], null, $listing);
    expect($process->getExitCode())->toBe($code);
    if ($code === 0) {
        expect($process->getErrorOutput())->toContain('already exists for v0.1.0');
    }
})->with([
    'present' => ["v0.0.9\nv0.1.0\n", 0],
    'only one' => ["v0.1.0\n", 0],
    'absent' => ["v0.0.9\nv0.1.0-rc.1\nv0.1.01\n", 1],
    'empty' => ['', 1],
]);

it('creates a release with a verified tag and pre-release only for suffixed tags', function (string $tag, bool $pre) {
    $directory = releaseTemp();
    file_put_contents("$directory/notes.md", 'Notes');
    $gh = executable("$directory/gh", 'printf "%s\n" "$@" > "$GH_LOG"');
    $process = releaseRun('create-release.sh', [$tag, "$directory/notes.md"], ['RELEASE_GH_COMMAND' => $gh, 'GH_LOG' => "$directory/args"]);
    $args = file($directory.'/args', FILE_IGNORE_NEW_LINES);
    expect($process->getExitCode())->toBe(0)->and(array_slice($args, 0, 3))->toBe(['release', 'create', $tag])->and($args)->toContain('--verify-tag')->and($args)->toContain('--notes-file');
    expect(in_array('--prerelease', $args, true))->toBe($pre);
})->with([['v0.1.0', false], ['v0.1.0-rc.1', true], ['v0.1.0-beta2', true]]);

it('refuses to create a release for an invalid tag', function () {
    $directory = releaseTemp();
    file_put_contents("$directory/notes.md", 'Notes');
    $gh = executable("$directory/gh", 'touch "$GH_LOG"');
    $process = releaseRun('create-release.sh', ['v0.1.0-foo', "$directory/notes.md"], ['RELEASE_GH_COMMAND' => $gh, 'GH_LOG' => "$directory/args"]);
    expect($process->getExitCode())->toBe(1)->and(file_exists("$directory/args"))->toBeFalse();
});

it('fails the build check on changed or untracked files', function () {
    $directory = releaseRepo(['dist/app.js' => 'a', 'resources/js/lib/cn-tables.ts' => 'b']);
    expect(releaseRun('dist-clean.sh', [], [], $directory)->getExitCode())->toBe(0);
    file_put_contents("$directory/dist/app.js", 'changed');
    $modified = releaseRun('dist-clean.sh', [], [], $directory);
    expect($modified->getExitCode())->toBe(1)->and($modified->getErrorOutput())->toContain('dist/app.js');
    git($directory, 'checkout', '--', 'dist/app.js');
    file_put_contents("$directory/dist/new.js", 'x');
    $untracked = releaseRun('dist-clean.sh', [], [], $directory);
    expect($untracked->getExitCode())->toBe(1)->and($untracked->getErrorOutput())->toContain('?? dist/new.js');
    unlink("$directory/dist/new.js");
    file_put_contents("$directory/resources/js/lib/cn-tables.ts", 'changed');
    expect(releaseRun('dist-clean.sh', [], [], $directory)->getExitCode())->toBe(1);
});

function preflightSetup(string $changelog = "## v0.1.0\n\nNotes.\n"): array
{
    $remote = releaseRepo(['CHANGELOG.md' => $changelog]);
    $clone = releaseClone($remote);

    return [$remote, $clone, git($remote, 'rev-parse', 'HEAD')];
}

it('prints the checked commit and tag commands in preflight', function () {
    [, $clone, $sha] = preflightSetup();
    $process = releaseRun('preflight.sh', ['v0.1.0'], ['PREFLIGHT_SKIP_RUNS' => '1'], $clone);
    expect($process->getExitCode())->toBe(0)->and($process->getOutput())->toContain("Checked commit $sha")->and($process->getOutput())->toContain("git tag v0.1.0 $sha && git push origin v0.1.0")->and($process->getOutput())->toContain('Nothing has checked that the committed dist/');
    expect(git($clone, 'tag'))->toBe('');
});

it('checks origin/main even when local main is behind', function () {
    [$remote, $clone] = preflightSetup();
    git($remote, 'commit', '--quiet', '--allow-empty', '-m', 'next');
    $head = git($remote, 'rev-parse', 'HEAD');
    $process = releaseRun('preflight.sh', ['v0.1.0'], ['PREFLIGHT_SKIP_RUNS' => '1'], $clone);
    expect($process->getExitCode())->toBe(0)->and($process->getOutput())->toContain("git tag v0.1.0 $head");
});

it('refuses an invalid tag in preflight', function () {
    [, $clone] = preflightSetup("## v0.1.0-foo\n\nNotes.\n");
    $process = releaseRun('preflight.sh', ['v0.1.0-foo'], ['PREFLIGHT_SKIP_RUNS' => '1'], $clone);
    expect($process->getExitCode())->toBe(1)->and($process->getErrorOutput())->toContain('Invalid release tag');
});

it('refuses an existing local preflight tag', function () {
    [, $clone] = preflightSetup();
    git($clone, 'tag', 'v0.1.0');
    $process = releaseRun('preflight.sh', ['v0.1.0'], ['PREFLIGHT_SKIP_RUNS' => '1'], $clone);
    expect($process->getExitCode())->toBe(1)->and($process->getErrorOutput())->toContain('exists locally');
});

it('refuses a tag that exists on the remote', function () {
    [$remote, $clone] = preflightSetup();
    git($remote, 'tag', 'v0.1.0');
    $process = releaseRun('preflight.sh', ['v0.1.0'], ['PREFLIGHT_SKIP_RUNS' => '1'], $clone);
    expect($process->getExitCode())->toBe(1)->and($process->getErrorOutput())->toContain('exists on origin');
});

it('refuses a commit outside main in preflight', function () {
    [$remote, $clone] = preflightSetup();
    git($remote, 'checkout', '--quiet', '-b', 'feature');
    git($remote, 'commit', '--quiet', '--allow-empty', '-m', 'feature');
    git($clone, 'fetch', '--quiet', 'origin', 'feature');
    $process = releaseRun('preflight.sh', ['v0.1.0'], ['PREFLIGHT_SKIP_RUNS' => '1', 'PREFLIGHT_COMMIT' => 'origin/feature'], $clone);
    expect($process->getExitCode())->toBe(1)->and($process->getErrorOutput())->toContain('not an ancestor');
});

it('reads the changelog at the checked commit, not the working tree', function () {
    [, $clone] = preflightSetup("## v0.0.1\n\nOld.\n");
    file_put_contents("$clone/CHANGELOG.md", "## v0.1.0\n\nOnly local.\n");
    $process = releaseRun('preflight.sh', ['v0.1.0'], ['PREFLIGHT_SKIP_RUNS' => '1'], $clone);
    expect($process->getExitCode())->toBe(1)->and($process->getErrorOutput())->toContain('no heading');

    [, $clone] = preflightSetup();
    file_put_contents("$clone/CHANGELOG.md", "## v0.0.1\n\nOld.\n");
    expect(releaseRun('preflight.sh', ['v0.1.0'], ['PREFLIGHT_SKIP_RUNS' => '1'], $clone)->getExitCode())->toBe(0);
});

it('refuses a missing changelog at the commit in preflight', function () {
    $remote = releaseRepo();
    $clone = releaseClone($remote);
    $process = releaseRun('preflight.sh', ['v0.1.0'], ['PREFLIGHT_SKIP_RUNS' => '1'], $clone);
    expect($process->getExitCode())->toBe(1)->and($process->getErrorOutput())->toContain('does not exist at commit');
});

it('checks the workflow runs in preflight without waiting', function () {
    [, $clone] = preflightSetup();
    $directory = releaseTemp();
    mkdir("$directory/bin");
    executable("$directory/bin/gh", 'exit 0');
    $env = ['PATH' => "$directory/bin:".getenv('PATH'), 'GH_REPO' => 'o/r', 'RELEASE_RUNS_SLEEP_SECONDS' => '30'];
    $green = executable("$directory/green", 'printf \'{"workflow_runs":[{"head_sha":"%s","head_branch":"main","event":"push","status":"completed","conclusion":"success"}]}\' "$2"');
    $passed = releaseRun('preflight.sh', ['v0.1.0'], $env + ['RELEASE_RUNS_FETCH_COMMAND' => $green], $clone);
    expect($passed->getExitCode())->toBe(0)->and($passed->getOutput())->toContain('covered by the green tests run')->and($passed->getOutput())->not->toContain('Nothing has checked');

    $red = executable("$directory/red", 'printf \'{"workflow_runs":[{"head_sha":"%s","head_branch":"main","event":"push","status":"completed","conclusion":"failure"}]}\' "$2"');
    $failed = releaseRun('preflight.sh', ['v0.1.0'], $env + ['RELEASE_RUNS_FETCH_COMMAND' => $red], $clone);
    expect($failed->getExitCode())->toBe(1)->and($failed->getOutput())->not->toContain('git tag');

    $started = microtime(true);
    $busy = executable("$directory/busy", 'printf \'{"workflow_runs":[{"head_sha":"%s","head_branch":"main","event":"push","status":"in_progress"}]}\' "$2"');
    $pending = releaseRun('preflight.sh', ['v0.1.0'], $env + ['RELEASE_RUNS_FETCH_COMMAND' => $busy], $clone);
    expect($pending->getExitCode())->toBe(1)->and($pending->getErrorOutput())->toContain('in_progress')->and(microtime(true) - $started)->toBeLessThan(20.0);
});

it('requires gh for the run check in preflight', function () {
    [, $clone] = preflightSetup();
    $directory = releaseTemp();
    mkdir("$directory/bin");
    foreach (['git', 'bash', 'php', 'mktemp', 'rm', 'dirname', 'awk', 'env'] as $tool) {
        $path = trim((new Process(['sh', '-c', "command -v $tool"]))->mustRun()->getOutput());
        symlink($path, "$directory/bin/$tool");
    }
    $process = releaseRun('preflight.sh', ['v0.1.0'], ['PATH' => "$directory/bin"], $clone);
    expect($process->getExitCode())->toBe(1)->and($process->getErrorOutput())->toContain('gh is required');
});

it('declares exactly the trigger and permissions', function () {
    $yaml = workflow();
    expect($yaml['permissions'])->toBe([])->and($yaml['on'])->toBe(['push' => ['tags' => ['v*']]])->and($yaml['defaults']['run']['shell'])->toBe('bash')->and($yaml['jobs']['verify']['permissions'])->toBe(['contents' => 'read', 'actions' => 'read'])->and($yaml['jobs']['release']['permissions'])->toBe(['contents' => 'write'])->and($yaml['jobs']['packagist']['permissions'])->toBe(['contents' => 'read']);
    $writes = 0;
    foreach ($yaml['jobs'] as $job) {
        foreach ($job['permissions'] as $permission) {
            $writes += $permission === 'write' ? 1 : 0;
        }
    }
    expect($writes)->toBe(1);
});

it('keeps the workflow free of pushes, secrets and unpinned third-party actions', function () {
    $text = workflowText();
    expect($text)->not->toMatch('/git push|git tag|--force|npm publish|workflow_dispatch|pull_request_target/')->not->toMatch('/secrets\\./');
    preg_match_all('/uses: ([^\\s]+)/', $text, $matches);
    expect($matches[1])->not->toBeEmpty();
    foreach ($matches[1] as $action) {
        expect(str_starts_with($action, 'actions/') || preg_match('/@[a-f0-9]{40}$/', $action) === 1)->toBeTrue();
    }
});

it('never expands an expression inside a run script', function () {
    $count = 0;
    foreach (workflow()['jobs'] as $job) {
        foreach ($job['steps'] as $step) {
            if (isset($step['run'])) {
                $count++;
                expect($step['run'])->not->toContain('${{');
            }
        }
    }
    expect($count)->toBeGreaterThan(5);
});

it('does not keep the checkout credential', function () {
    $checkouts = 0;
    foreach (workflow()['jobs'] as $job) {
        foreach ($job['steps'] as $step) {
            if (str_starts_with($step['uses'] ?? '', 'actions/checkout@')) {
                $checkouts++;
                expect($step['with']['persist-credentials'])->toBeFalse();
            }
        }
    }
    expect($checkouts)->toBe(3);
});

it('wires the verify, release and packagist steps to their scripts', function () {
    $jobs = workflow()['jobs'];
    $run = fn (string $job) => implode("\n", array_map(fn ($step) => $step['run'] ?? '', $jobs[$job]['steps']));
    expect($run('verify'))->toContain('scripts/release/tag-version.sh "$TAG"')->toContain('scripts/release/on-main.sh "$sha"')->toContain('scripts/release/wait-for-checks.sh "$SHA"')->toContain('npm run build')->toContain('scripts/release/dist-clean.sh')->toContain('changelog-entry.sh "$TAG"')->toContain('encode-notes.sh');
    expect($run('release'))->toContain('release-exists.sh "$TAG"')->toContain('decode-notes.sh')->toContain('create-release.sh "$TAG"');
    expect($run('packagist'))->toContain('packagist-wait.sh "$TAG"');
    expect($jobs['release']['needs'])->toBe('verify')->and($jobs['packagist']['needs'])->toBe('release');
    expect($jobs['verify']['timeout-minutes'])->toBeGreaterThanOrEqual(35)->and($jobs['packagist']['timeout-minutes'])->toBeGreaterThanOrEqual(25);
});
