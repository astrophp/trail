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
function releaseRun(string $script, array $args = [], array $env = [], ?string $cwd = null): Process
{
    $process = new Process([releaseRoot().'/scripts/release/'.$script, ...$args], $cwd ?? releaseRoot(), array_merge($_ENV, $env));
    $process->run();

    return $process;
}
function runJson(string $status, ?string $conclusion = null): string
{
    return json_encode(['workflow_runs' => [['head_sha' => 'abc', 'head_branch' => 'main', 'event' => 'push', 'status' => $status, 'conclusion' => $conclusion]]], JSON_THROW_ON_ERROR);
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
})->with([['v0.1.0', false], ['v0.1.0-rc.1', true]]);
it('refuses invalid tags including an empty argument', function (string $tag) {
    $process = releaseRun('tag-version.sh', [$tag]);
    expect($process->getExitCode())->toBe(1)->and($process->getErrorOutput())->toContain('Invalid release tag');
})->with(['', 'v1.2', '0.1.0', 'vx', 'v0.1.0;echo']);

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
    'longer version' => ['v0.1.0', "## v0.1.01\n\nNo.\n", 'no heading'],
    'pre release heading' => ['v0.1.0', "## v0.1.0-rc.1\n\nNo.\n", 'no heading'],
    'stable heading' => ['v0.1.0-rc.1', "## v0.1.0\n\nNo.\n", 'no heading'],
    'empty entry' => ['v0.1.0', "## v0.1.0\n\n## v0.0.9\n", 'no release notes'],
]);

it('checks commits on main directly', function () {
    $directory = releaseTemp();
    foreach ([['git', 'init', '--initial-branch=main'], ['git', 'config', 'user.email', 't@e'], ['git', 'config', 'user.name', 'T'], ['git', 'commit', '--allow-empty', '-m', 'main']] as $command) {
        (new Process($command, $directory))->mustRun();
    }
    $main = trim((new Process(['git', 'rev-parse', 'HEAD'], $directory))->mustRun()->getOutput());
    expect(releaseRun('on-main.sh', [$main, 'main'], [], $directory)->getExitCode())->toBe(0);
    (new Process(['git', 'checkout', '-b', 'feature'], $directory))->mustRun();
    (new Process(['git', 'commit', '--allow-empty', '-m', 'feature'], $directory))->mustRun();
    $process = releaseRun('on-main.sh', ['HEAD', 'main'], [], $directory);
    expect($process->getExitCode())->toBe(1)->and($process->getErrorOutput())->toContain('not an ancestor');
});

it('classifies workflow runs with messages', function (string $input, int $code, string $message) {
    $process = new Process([releaseRoot().'/scripts/release/runs-green.sh', 'tests.yml', 'abc', 'main'], releaseRoot());
    $process->setInput($input);
    $process->run();
    expect($process->getExitCode())->toBe($code)->and($process->getOutput().$process->getErrorOutput())->toContain($message);
})->with([
    'success' => [runJson('completed', 'success'), 0, 'successful'], 'failure' => [runJson('completed', 'failure'), 1, 'without success'], 'cancelled' => [runJson('completed', 'cancelled'), 1, 'cancelled'], 'in progress' => [runJson('in_progress'), 2, 'in_progress'], 'none' => ['{"workflow_runs":[]}', 1, 'no push run'], 'other sha' => ['{"workflow_runs":[{"head_sha":"other","head_branch":"main","event":"push","status":"completed","conclusion":"success"}]}', 1, 'no push run'], 'other branch' => ['{"workflow_runs":[{"head_sha":"abc","head_branch":"feature","event":"push","status":"completed","conclusion":"success"}]}', 1, 'no push run'], 'invalid json' => ['no', 1, 'invalid runs JSON'],
]);

it('waits for runs and keeps fetch errors', function (array $responses, int $code, string $message) {
    $directory = releaseTemp();
    $fetcher = "$directory/fetch";
    $state = "$directory/state";
    $source = "$directory/source";
    file_put_contents($source, implode("\n", $responses));
    file_put_contents($fetcher, "#!/bin/sh\ncount=0; [ -f \"\$RUNS_STATE\" ] && count=\$(cat \"\$RUNS_STATE\"); count=\$((count+1)); printf '%s' \"\$count\" > \"\$RUNS_STATE\"; sed -n \"\${count}p\" \"\$RUNS_SOURCE\"\n");
    chmod($fetcher, 0755);
    $process = releaseRun('wait-for-runs.sh', ['tests.yml', 'abc'], ['RELEASE_RUNS_FETCH_COMMAND' => $fetcher, 'RUNS_STATE' => $state, 'RUNS_SOURCE' => $source, 'RELEASE_RUNS_ATTEMPTS' => '2', 'RELEASE_RUNS_SLEEP_SECONDS' => '0']);
    expect($process->getExitCode())->toBe($code)->and($process->getOutput().$process->getErrorOutput())->toContain($message);
})->with([[[runJson('in_progress'), runJson('completed', 'success')], 0, 'successful'], [[runJson('in_progress'), runJson('in_progress')], 1, 'did not finish'], [[runJson('completed', 'failure')], 1, 'without success']]);

it('reports a failed run fetch', function () {
    $directory = releaseTemp();
    $fetcher = "$directory/fetch";
    file_put_contents($fetcher, "#!/bin/sh\nprintf 'unavailable\\n' >&2\nexit 1\n");
    chmod($fetcher, 0755);
    $process = releaseRun('wait-for-runs.sh', ['tests.yml', 'abc'], ['RELEASE_RUNS_FETCH_COMMAND' => $fetcher, 'RELEASE_RUNS_ATTEMPTS' => '1']);
    expect($process->getExitCode())->toBe(1)->and($process->getErrorOutput())->toContain('unavailable');
});

it('stops polling after one failed run', function () {
    $directory = releaseTemp();
    $fetcher = "$directory/fetch";
    $calls = "$directory/calls";
    file_put_contents($fetcher, "#!/bin/sh\nprintf x >> \"\$CALLS\"\nprintf '%s' '\"'\"'{\"workflow_runs\":[{\"head_sha\":\"abc\",\"head_branch\":\"main\",\"event\":\"push\",\"status\":\"completed\",\"conclusion\":\"failure\"}]}'\"'\"'\n");
    chmod($fetcher, 0755);
    $process = releaseRun('wait-for-runs.sh', ['tests.yml', 'abc'], ['RELEASE_RUNS_FETCH_COMMAND' => $fetcher, 'CALLS' => $calls, 'RELEASE_RUNS_ATTEMPTS' => '2', 'RELEASE_RUNS_SLEEP_SECONDS' => '0']);
    expect($process->getExitCode())->toBe(1)->and(file_get_contents($calls))->toBe('x');
});

it('requires exact Packagist versions', function (string $tag, string $listed, int $code) {
    $file = releaseTemp().'/metadata';
    file_put_contents($file, json_encode(['packages' => ['astrophp/trail' => [['version' => $listed]]]]));
    $process = releaseRun('packagist-wait.sh', [$tag], ['PACKAGIST_URL' => "file://$file", 'PACKAGIST_ATTEMPTS' => '1', 'PACKAGIST_SLEEP_SECONDS' => '0']);
    expect($process->getExitCode())->toBe($code);
})->with([['v0.1.0', 'v0.1.0', 0], ['v0.1.0', 'v0.1.0-rc.1', 1], ['v0.1.0-rc.1', 'v0.1.0', 1]]);

it('handles unavailable and normalized Packagist metadata', function () {
    $bad = releaseRun('packagist-wait.sh', ['v0.1.0'], ['PACKAGIST_URL' => 'file:///missing-release-metadata', 'PACKAGIST_ATTEMPTS' => '2', 'PACKAGIST_SLEEP_SECONDS' => '0']);
    expect($bad->getExitCode())->toBe(1)->and($bad->getErrorOutput())->toContain('hook did not deliver');
    $file = releaseTemp().'/metadata';
    file_put_contents($file, json_encode(['packages' => ['astrophp/trail' => [['version_normalized' => '0.1.0.0']]]]));
    expect(releaseRun('packagist-wait.sh', ['v0.1.0'], ['PACKAGIST_URL' => "file://$file", 'PACKAGIST_ATTEMPTS' => '1'])->getExitCode())->toBe(0);
});

it('refuses an existing local preflight tag', function () {
    $directory = releaseTemp();
    foreach ([['git', 'init', '--initial-branch=main'], ['git', 'config', 'user.email', 't@e'], ['git', 'config', 'user.name', 'T'], ['git', 'commit', '--allow-empty', '-m', 'x'], ['git', 'tag', 'v0.1.0']] as $command) {
        (new Process($command, $directory))->mustRun();
    } expect(releaseRun('preflight.sh', ['v0.1.0'], [], $directory)->getExitCode())->toBe(1);
});

it('refuses missing changelogs and commits outside main in preflight', function (string $kind) {
    $directory = releaseTemp();
    foreach ([['git', 'init', '--initial-branch=main'], ['git', 'config', 'user.email', 't@e'], ['git', 'config', 'user.name', 'T'], ['git', 'commit', '--allow-empty', '-m', 'x']] as $command) {
        (new Process($command, $directory))->mustRun();
    } if ($kind === 'branch') {
        (new Process(['git', 'checkout', '-b', 'feature'], $directory))->mustRun();
        (new Process(['git', 'commit', '--allow-empty', '-m', 'y'], $directory))->mustRun();
    } $process = releaseRun('preflight.sh', ['v0.1.0'], ['PREFLIGHT_REMOTE' => '.', 'PREFLIGHT_MAIN_REF' => 'main', 'PREFLIGHT_COMMIT' => $kind === 'branch' ? 'HEAD' : 'main', 'PREFLIGHT_SKIP_RUNS' => '1'], $directory);
    expect($process->getExitCode())->toBe(1);
})->with(['missing', 'branch']);

it('parses workflow permissions and trigger exactly', function () {
    $yaml = Yaml::parseFile(releaseRoot().'/.github/workflows/release.yml');
    expect($yaml['permissions'])->toBe([])->and($yaml['on'])->toBe(['push' => ['tags' => ['v*']]])->and($yaml['jobs']['verify']['permissions'])->toBe(['contents' => 'read', 'actions' => 'read'])->and($yaml['jobs']['release']['permissions'])->toBe(['contents' => 'write'])->and($yaml['jobs']['packagist']['permissions'])->toBe(['contents' => 'read']);
    $writes = 0;
    foreach ($yaml['jobs'] as $job) {
        foreach ($job['permissions'] as $permission) {
            if ($permission === 'write') {
                $writes++;
            }
        }
    } expect($writes)->toBe(1);
    $text = file_get_contents(releaseRoot().'/.github/workflows/release.yml');
    expect($text)->not->toMatch('/git push|git tag|--force|npm publish/')->not->toMatch('/secrets\\./');
    preg_match_all('/uses: ([^\\s]+)/', $text, $matches);
    foreach ($matches[1] as $action) {
        expect(str_starts_with($action, 'actions/') || preg_match('/@[a-f0-9]{40}$/', $action) === 1)->toBeTrue();
    }
});
