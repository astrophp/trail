<?php

/*
|--------------------------------------------------------------------------
| docs/configuration.md documents config/trail.php
|--------------------------------------------------------------------------
|
| Every key of the file, in the file's order, with its environment variable and its default. The
| tests fail when a key is added to the file and not to the page, when the page lists a key the
| file does not have, when an environment variable is missing or wrong, and when a default differs.
|
| The long lists are not copied into the page. The redaction keys are listed there and compared in
| full; the redaction patterns and the price table are compared by their size (22 patterns, 85
| models across 7 providers), which is what a change to them almost always changes. Their
| contents are only in the file.
|
*/

/** The leaf keys of the config file, as dotted paths, in order. Lists and the price table are leaves. */
function trailConfigLeaves(array $config, string $prefix = ''): array
{
    $leaves = [];

    foreach ($config as $key => $value) {
        $path = $prefix.$key;

        if (is_array($value) && ! array_is_list($value) && $path !== 'pricing') {
            $leaves += trailConfigLeaves($value, $path.'.');

            continue;
        }

        $leaves[$path] = $value;
    }

    return $leaves;
}

/** The environment variable each key of the file reads, by dotted path, found in the file's own text. */
function trailConfigEnvironment(): array
{
    $environment = [];
    $group = null;

    foreach (file(dirname(__DIR__, 3).'/config/trail.php', FILE_IGNORE_NEW_LINES) as $line) {
        if (preg_match("/^    '([a-z_]+)' => (.*)$/", $line, $match) === 1) {
            $group = null;

            if (str_ends_with($match[2], '[') && $match[1] !== 'pricing') {
                $group = $match[1];

                continue;
            }

            $environment[$match[1]] = preg_match("/env\\('([A-Z_]+)'/", $match[2], $env) === 1 ? $env[1] : null;
        } elseif ($group !== null && preg_match("/^        '([a-z_]+)' => (.*)$/", $line, $match) === 1) {
            $environment["{$group}.{$match[1]}"] = preg_match("/env\\('([A-Z_]+)'/", $match[2], $env) === 1 ? $env[1] : null;
        }
    }

    return $environment;
}

/** The rows of the keys table: dotted key => [environment variable or null, default cell]. */
function trailDocumentedKeys(): array
{
    $rows = [];

    foreach (file(dirname(__DIR__, 3).'/docs/configuration.md', FILE_IGNORE_NEW_LINES) as $line) {
        if (preg_match('/^\| `([a-z_.]+)` \| (.+?) \| (.+?) \| .+ \|$/', $line, $match) !== 1) {
            continue;
        }

        $rows[$match[1]] = [
            $match[2] === 'none' ? null : trim($match[2], '`'),
            $match[3],
        ];
    }

    return $rows;
}

/** How a default is written in the page's default column. */
function trailRenderDefault(string $key, mixed $value): string
{
    if ($key === 'redaction.keys') {
        return count($value).' entries, listed [below](#redaction-keys)';
    }

    if ($key === 'redaction.patterns') {
        return count($value).' patterns';
    }

    if ($key === 'pricing') {
        return array_sum(array_map('count', $value)).' models across '.count($value).' providers, see [Cost](cost.md)';
    }

    return match (true) {
        is_bool($value) => $value ? '`true`' : '`false`',
        $value === null => '`null`',
        is_float($value) => '`'.var_export($value, true).'`',
        is_int($value) => "`{$value}`",
        is_string($value) => "`'{$value}'`",
        is_array($value) => '`['.implode(', ', array_map(fn ($item) => "'{$item}'", $value)).']`',
    };
}

it('documents every key of the config file, in the file\'s order, and no other', function () {
    expect(array_keys(trailDocumentedKeys()))->toBe(array_keys(trailConfigLeaves(require dirname(__DIR__, 3).'/config/trail.php')));
});

it('documents the environment variable of every key, and none for the others', function () {
    $documented = array_map(fn (array $row) => $row[0], trailDocumentedKeys());

    expect($documented)->toBe(trailConfigEnvironment());
});

it('mentions every environment variable the config file reads', function () {
    $source = (string) file_get_contents(dirname(__DIR__, 3).'/config/trail.php');
    $page = (string) file_get_contents(dirname(__DIR__, 3).'/docs/configuration.md');

    preg_match_all("/env\\('([A-Z_]+)'/", $source, $matches);

    expect($matches[1])->not->toBeEmpty();

    foreach ($matches[1] as $name) {
        expect($page)->toContain("`{$name}`");
    }
});

it('documents the default of every key', function () {
    $documented = trailDocumentedKeys();

    foreach (trailConfigLeaves(require dirname(__DIR__, 3).'/config/trail.php') as $key => $value) {
        expect($documented[$key][1] ?? null)->toBe(trailRenderDefault($key, $value), "The default of [{$key}] on the page differs from the config file.");
    }
});

it('lists the default redaction keys in full', function () {
    $page = (string) file_get_contents(dirname(__DIR__, 3).'/docs/configuration.md');

    expect(preg_match('/<!-- redaction-keys:start -->(.*?)<!-- redaction-keys:end -->/s', $page, $block))->toBe(1);

    preg_match_all('/`([^`]+)`/', $block[1], $listed);

    $config = require dirname(__DIR__, 3).'/config/trail.php';

    expect($listed[1])->toBe($config['redaction']['keys']);
});

it('would notice a key that is missing from the page', function () {
    $config = require dirname(__DIR__, 3).'/config/trail.php';
    $config['dashboard']['a_new_key'] = true;

    expect(array_keys(trailDocumentedKeys()))->not->toBe(array_keys(trailConfigLeaves($config)));
});
