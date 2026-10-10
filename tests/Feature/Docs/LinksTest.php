<?php

use Astro\Trail\Tests\Fixtures\Docs\Pages;

/*
|--------------------------------------------------------------------------
| Links in the Markdown pages point at something
|--------------------------------------------------------------------------
|
| Every relative link in the README, the guides in docs/, CONTRIBUTING.md, CHANGELOG.md and
| ROADMAP.md names a file or directory that exists, and a heading anchor names a heading that the
| target page has. Links with a scheme (https:, mailto:) are not followed.
|
*/

/** The text of a page without its fenced code blocks and inline code, which can hold link-like text. */
function proseOf(string $text): string
{
    $text = preg_replace('/^```.*?^```$/ms', '', $text) ?? $text;

    return preg_replace('/`[^`\n]*`/', '', $text) ?? $text;
}

/** GitHub's anchor for each heading of a page, repeated headings numbered from -1. */
function anchorsOf(string $text): array
{
    $text = preg_replace('/^```.*?^```$/ms', '', $text) ?? $text;
    $anchors = [];
    $seen = [];

    preg_match_all('/^#{1,6}\s+(.+?)\s*#*$/m', $text, $headings);

    foreach ($headings[1] as $heading) {
        $heading = preg_replace('/\[([^\]]*)\]\([^)]*\)/', '$1', $heading) ?? $heading;
        $heading = str_replace(['`', '*'], '', $heading);
        $slug = str_replace(' ', '-', preg_replace('/[^\p{L}\p{N}\s_-]/u', '', mb_strtolower($heading)) ?? '');

        $count = $seen[$slug] ?? 0;
        $seen[$slug] = $count + 1;
        $anchors[] = $count === 0 ? $slug : "{$slug}-{$count}";
    }

    return $anchors;
}

it('has pages to check', function () {
    $names = array_map('basename', Pages::all());

    expect($names)->toContain('README.md', 'CONTRIBUTING.md', 'CHANGELOG.md', 'ROADMAP.md', 'configuration.md', 'limits.md');
});

/**
 * Every link and image target of a page: Markdown links and images, and the src and srcset of HTML
 * tags (<img>, <source>). Targets with a scheme are not followed.
 *
 * @return list<string>
 */
function targetsOf(string $text): array
{
    $text = proseOf($text);
    preg_match_all('/\]\(([^)\s]+)\)/', $text, $markdown);
    preg_match_all('/\bsrc=["\']([^"\']+)["\']/i', $text, $sources);
    preg_match_all('/\bsrcset=["\']([^"\']+)["\']/i', $text, $sets);

    $targets = [...$markdown[1], ...$sources[1]];

    foreach ($sets[1] as $set) {
        foreach (explode(',', $set) as $candidate) {
            $targets[] = strtok(trim($candidate), ' ');
        }
    }

    return array_values(array_filter($targets, fn (string $target) => preg_match('#^[a-z][a-z0-9+.-]*:#i', $target) !== 1));
}

/**
 * What is wrong with the targets of a page's links and images, naming the page.
 *
 * @return array{broken: list<string>, checked: int}
 */
function brokenTargets(string $page, string $text): array
{
    $broken = [];
    $checked = 0;

    foreach (targetsOf($text) as $target) {
        [$path, $anchor] = array_pad(explode('#', $target, 2), 2, null);
        $file = $path === '' ? $page : realpath(dirname($page).'/'.$path);
        $checked++;

        if ($file === false || ! file_exists($file)) {
            $broken[] = basename($page)." -> {$target} (no such file)";

            continue;
        }

        if ($anchor !== null && $anchor !== '' && str_ends_with($file, '.md') && ! in_array($anchor, anchorsOf(Pages::read($file)), true)) {
            $broken[] = basename($page)." -> {$target} (no such heading)";
        }
    }

    return ['broken' => $broken, 'checked' => $checked];
}

it('links only to files and headings that exist', function () {
    $broken = [];
    $checked = 0;

    foreach (Pages::all() as $page) {
        $result = brokenTargets($page, Pages::read($page));
        array_push($broken, ...$result['broken']);
        $checked += $result['checked'];
    }

    expect($checked)->toBeGreaterThan(30)->and($broken)->toBe([]);
});

it('checks images the way it checks links', function () {
    $page = Pages::root().'/docs/installation.md';
    $text = <<<'MD'
        ![online](https://example.com/a.png)
        ![here](installation.md)
        ![missing](images/missing.png)
        [![badge](https://example.com/b.svg)](https://example.com/x)
        <img src="images/other-missing.png" alt="x">
        <img src="https://example.com/c.png" alt="x">
        <picture>
          <source srcset="images/dark.png 1x, https://example.com/d.png 2x" media="(prefers-color-scheme: dark)">
          <img src="configuration.md" alt="x">
        </picture>
        `![in code](images/ignored.png)`
        MD;

    $result = brokenTargets($page, $text);

    expect($result['broken'])->toBe([
        'installation.md -> images/missing.png (no such file)',
        'installation.md -> images/other-missing.png (no such file)',
        'installation.md -> images/dark.png (no such file)',
    ])->and($result['checked'])->toBe(5);
});

it('would notice a link to a page or a heading that is not there', function () {
    $anchors = anchorsOf(Pages::read(Pages::root().'/docs/operations.md'));

    expect($anchors)->toContain('sqlite-and-concurrent-writers')
        ->and($anchors)->not->toContain('no-such-heading')
        ->and(file_exists(Pages::root().'/docs/no-such-page.md'))->toBeFalse();
});
