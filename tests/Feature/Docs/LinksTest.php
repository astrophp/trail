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

it('links only to files and headings that exist', function () {
    $broken = [];
    $checked = 0;

    foreach (Pages::all() as $page) {
        preg_match_all('/(?<!!)\[[^\]]*\]\(([^)\s]+)\)/', proseOf(Pages::read($page)), $links);

        foreach ($links[1] as $target) {
            if (preg_match('#^[a-z][a-z0-9+.-]*:#i', $target) === 1) {
                continue;
            }

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
    }

    expect($checked)->toBeGreaterThan(30)->and($broken)->toBe([]);
});

it('would notice a link to a page or a heading that is not there', function () {
    $anchors = anchorsOf(Pages::read(Pages::root().'/docs/operations.md'));

    expect($anchors)->toContain('sqlite-and-concurrent-writers')
        ->and($anchors)->not->toContain('no-such-heading')
        ->and(file_exists(Pages::root().'/docs/no-such-page.md'))->toBeFalse();
});

it('has no image in the pages, apart from the README\'s tests badge', function () {
    $badge = '[![tests](https://github.com/astrophp/trail/actions/workflows/tests.yml/badge.svg)](https://github.com/astrophp/trail/actions/workflows/tests.yml)';

    foreach (Pages::all() as $page) {
        $text = str_replace($badge, '', proseOf(Pages::read($page)));

        expect(preg_match('/!\[[^\]]*\]\(|<img\b/i', $text))->toBe(0, basename($page).' has an image.');
    }
});
