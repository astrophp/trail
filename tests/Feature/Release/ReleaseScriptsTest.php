<?php

use Symfony\Component\Process\Process;

function releaseRoot(): string
{
    return dirname(__DIR__, 3);
}

function releaseScript(string $script, array $arguments = [], array $environment = []): Process
{
    $process = new Process([releaseRoot().'/scripts/release/'.$script, ...$arguments], releaseRoot(), array_merge($_ENV, $environment));

    $process->run();

    return $process;
}

function releaseTempDirectory(): string
{
    $directory = sys_get_temp_dir().'/trail-release-'.bin2hex(random_bytes(8));
    mkdir($directory);

    return $directory;
}

it('validates release tags and identifies pre-releases', function (string $tag, bool $preRelease) {
    $process = releaseScript('tag-version.sh', [$tag]);

    expect($process->getExitCode())->toBe(0)
        ->and($process->getOutput())->toContain("version={$tag}")
        ->toContain('prerelease='.($preRelease ? 'true' : 'false'));
})->with([
    ['v0.1.0', false],
    ['v0.1.0-rc.1', true],
]);

it('refuses invalid release tags', function (string $tag) {
    $process = releaseScript('tag-version.sh', [$tag]);

    expect($process->getExitCode())->toBe(1)->and($process->getErrorOutput())->toContain('Invalid release tag');
})->with(['v1.2', '0.1.0', 'vx', 'v0.1.0;echo']);

it('accepts a tagged commit on main and refuses one outside it', function () {
    $directory = releaseTempDirectory();
    $commands = [
        ['git', 'init', '--initial-branch=main'], ['git', 'config', 'user.email', 'tests@example.test'], ['git', 'config', 'user.name', 'Tests'],
        ['git', 'commit', '--allow-empty', '-m', 'main'],
    ];
    foreach ($commands as $command) {
        (new Process($command, $directory))->mustRun();
    }
    $main = trim((new Process(['git', 'rev-parse', 'HEAD'], $directory))->mustRun()->getOutput());

    $onMain = new Process([releaseRoot().'/scripts/release/on-main.sh', $main, 'main'], $directory);
    $onMain->run();
    expect($onMain->getExitCode())->toBe(0);

    (new Process(['git', 'checkout', '-b', 'feature'], $directory))->mustRun();
    (new Process(['git', 'commit', '--allow-empty', '-m', 'feature'], $directory))->mustRun();
    $feature = trim((new Process(['git', 'rev-parse', 'HEAD'], $directory))->mustRun()->getOutput());
    $process = new Process([releaseRoot().'/scripts/release/on-main.sh', $feature, 'main'], $directory);
    $process->run();

    expect($process->getExitCode())->toBe(1)->and($process->getErrorOutput())->toContain('not an ancestor');
});

it('extracts only the requested changelog entry', function () {
    $file = releaseTempDirectory().'/CHANGELOG.md';
    file_put_contents($file, "# Changelog\n\n## v0.1.0 - 2026-10-10\n\nFirst note.\n\nSecond note.\n\n## v0.0.9\n\nOld note.\n");

    $process = releaseScript('changelog-entry.sh', ['v0.1.0', $file]);

    expect($process->getExitCode())->toBe(0)->and($process->getOutput())->toBe("First note.\n\nSecond note.\n");
});

it('refuses absent, empty, and similarly named changelog entries', function (string $tag, string $contents, string $message) {
    $file = releaseTempDirectory().'/CHANGELOG.md';
    file_put_contents($file, $contents);
    $process = releaseScript('changelog-entry.sh', [$tag, $file]);

    expect($process->getExitCode())->toBe(1)->and($process->getErrorOutput())->toContain($message);
})->with([
    ['v0.1.0', "## v0.1.01\n\nNot this one.\n", 'no heading'],
    ['v0.1.0', "## v0.1.0-rc.1\n\nNot this one.\n", 'no heading'],
    ['v0.1.0-rc.1', "## v0.1.0\n\nNot this one.\n", 'no heading'],
    ['v0.1.0', "## v0.1.0\n\n## v0.0.9\n\nOld.\n", 'no release notes'],
]);

it('classifies workflow runs', function (array $runs, int $exitCode, string $message) {
    $process = new Process([releaseRoot().'/scripts/release/runs-green.sh', 'tests.yml', 'abc', 'main'], releaseRoot());
    $process->setInput(json_encode(['workflow_runs' => $runs], JSON_THROW_ON_ERROR));
    $process->run();

    expect($process->getExitCode())->toBe($exitCode)->and($process->getOutput().$process->getErrorOutput())->toContain($message);
})->with([
    [[['head_sha' => 'abc', 'head_branch' => 'main', 'event' => 'push', 'status' => 'completed', 'conclusion' => 'success']], 0, 'successful'],
    [[['head_sha' => 'abc', 'head_branch' => 'main', 'event' => 'push', 'status' => 'completed', 'conclusion' => 'failure']], 1, 'without success'],
    [[['head_sha' => 'abc', 'head_branch' => 'main', 'event' => 'push', 'status' => 'completed', 'conclusion' => 'cancelled']], 1, 'cancelled'],
    [[['head_sha' => 'abc', 'head_branch' => 'main', 'event' => 'push', 'status' => 'in_progress', 'conclusion' => null]], 2, 'in_progress'],
    [[], 1, 'no push run'],
    [[['head_sha' => 'other', 'head_branch' => 'main', 'event' => 'push', 'status' => 'completed', 'conclusion' => 'success']], 1, 'no push run'],
    [[['head_sha' => 'abc', 'head_branch' => 'feature', 'event' => 'push', 'status' => 'completed', 'conclusion' => 'success']], 1, 'no push run'],
]);

it('waits for Packagist metadata without network access', function (string $version, int $exitCode, string $message) {
    $file = releaseTempDirectory().'/metadata.json';
    file_put_contents($file, json_encode(['packages' => ['astrophp/trail' => [['version' => $version]]]], JSON_THROW_ON_ERROR));
    $process = releaseScript('packagist-wait.sh', ['v0.1.0'], ['PACKAGIST_URL' => 'file://'.$file, 'PACKAGIST_ATTEMPTS' => '1', 'PACKAGIST_SLEEP_SECONDS' => '0']);

    expect($process->getExitCode())->toBe($exitCode)->and($process->getOutput().$process->getErrorOutput())->toContain($message);
})->with([
    ['v0.1.0', 0, 'lists'],
    ['v0.1.1', 1, 'hook did not deliver'],
]);

it('fails quickly when Packagist cannot be reached', function () {
    $process = releaseScript('packagist-wait.sh', ['v0.1.0'], ['PACKAGIST_URL' => 'file:///definitely-not-a-package.json', 'PACKAGIST_ATTEMPTS' => '2', 'PACKAGIST_SLEEP_SECONDS' => '0']);

    expect($process->getExitCode())->toBe(1)->and($process->getErrorOutput())->toContain('hook did not deliver');
});

it('accepts Packagist normalized versions', function () {
    $file = releaseTempDirectory().'/metadata.json';
    file_put_contents($file, json_encode(['packages' => ['astrophp/trail' => [['version_normalized' => '0.1.0.0']]]], JSON_THROW_ON_ERROR));
    $process = releaseScript('packagist-wait.sh', ['v0.1.0'], ['PACKAGIST_URL' => 'file://'.$file, 'PACKAGIST_ATTEMPTS' => '1', 'PACKAGIST_SLEEP_SECONDS' => '0']);

    expect($process->getExitCode())->toBe(0)->and($process->getOutput())->toContain('lists');
});

it('keeps the release workflow constrained', function () {
    $workflow = file_get_contents(releaseRoot().'/.github/workflows/release.yml');

    expect($workflow)->toContain("tags: ['v*']")
        ->toContain('permissions: {}')
        ->toMatch('/release:\n    needs: verify[\\s\\S]*?contents: write/')
        ->not->toContain('branches:')
        ->not->toContain('pull_request:')
        ->not->toContain('workflow_dispatch:')
        ->not->toMatch('/git push|git tag|--force|npm publish/')
        ->not->toMatch('/secrets\\.(?!GITHUB_TOKEN|github\\.token)/');

    preg_match_all('/uses: ([^\\s]+)/', $workflow, $matches);
    foreach ($matches[1] as $action) {
        expect(str_starts_with($action, 'actions/') || preg_match('/@[a-f0-9]{40}$/', $action) === 1)->toBeTrue();
    }

    expect(substr_count($workflow, 'contents: write'))->toBe(1);
});
