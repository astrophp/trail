<?php

use Astro\Trail\Tests\Fixtures\Docs\Pages;

/*
|--------------------------------------------------------------------------
| The README's images are the files in art/
|--------------------------------------------------------------------------
|
| The README points at its images by absolute URL on the default branch, so they also render on
| Packagist. A broken name would only show up on GitHub after a merge, so it is checked here: every
| such URL names a file in art/, every image has alt text, every screenshot has a light and a dark
| file, nothing in art/ is left unused, and the screenshots have the size they are taken at.
|
*/

const ART_URL = 'https://raw.githubusercontent.com/astrophp/trail/main/art/';

/** The README's image tags: <img>, with its src and alt. Alt is null when the tag has none. */
function artImages(string $readme): array
{
    preg_match_all('/<img\b[^>]*>/i', $readme, $tags);

    return array_map(function (string $tag): array {
        preg_match('/\bsrc="([^"]*)"/i', $tag, $src);
        $hasAlt = preg_match('/\balt="([^"]*)"/i', $tag, $alt) === 1;

        return ['src' => $src[1] ?? '', 'alt' => $hasAlt ? $alt[1] : null];
    }, $tags[0]);
}

/** Every URL of an image the README uses: <img src> and <source srcset>. */
function artReferences(string $readme): array
{
    preg_match_all('/\bsrcset="([^"]*)"/i', $readme, $sets);

    return array_values(array_unique([...array_column(artImages($readme), 'src'), ...$sets[1]]));
}

/** The files of art/ that the README names by absolute URL. @return list<string> */
function artNamed(string $readme): array
{
    $names = [];

    foreach (artReferences($readme) as $url) {
        if (str_starts_with($url, ART_URL)) {
            $names[] = substr($url, strlen(ART_URL));
        }
    }

    return array_values(array_unique($names));
}

/**
 * What is wrong with the README's images, given the files in art/.
 *
 * @param  list<string>  $files  the names of the files in art/, README.md and the social preview left out
 * @return list<string>
 */
function artProblems(string $readme, array $files): array
{
    $problems = [];
    $named = artNamed($readme);

    foreach ($named as $name) {
        if (! in_array($name, $files, true)) {
            $problems[] = "{$name} is not in art/";
        }
    }

    foreach (artImages($readme) as $image) {
        if (trim((string) $image['alt']) === '') {
            $problems[] = "{$image['src']} has no alt text";
        }

        if ($image['src'] !== '' && ! str_starts_with($image['src'], 'https://') && ! file_exists(Pages::root().'/'.$image['src'])) {
            $problems[] = "{$image['src']} does not exist";
        }
    }

    foreach ($named as $name) {
        foreach (['-light' => '-dark', '-dark' => '-light'] as $from => $to) {
            $pair = preg_replace('/'.$from.'\.(png|svg)$/', $to.'.$1', $name);

            if ($pair !== $name && ! in_array($pair, $named, true)) {
                $problems[] = "{$name} has no {$to} variant in the README";
            }
        }
    }

    foreach (artReferences($readme) as $url) {
        if (preg_match('#(^|/)art/#', $url) === 1 && ! str_starts_with($url, ART_URL)) {
            $problems[] = "{$url} is an art/ image but not an absolute URL on main";
        }
    }

    preg_match_all('#<picture>(.*?)</picture>#s', $readme, $pictures);

    foreach ($pictures[1] as $picture) {
        $source = strpos($picture, '<source');
        $image = strpos($picture, '<img');
        preg_match('/<source\b[^>]*>/', $picture, $sourceTag);
        preg_match('/\bsrcset="([^"]*)"/', $sourceTag[0] ?? '', $dark);
        preg_match('/<img\b[^>]*\bsrc="([^"]*)"/', $picture, $light);
        $label = basename($light[1] ?? 'picture');

        if ($source === false || $image === false || $source > $image) {
            $problems[] = "{$label}: the dark <source> must come before the <img>";
        } elseif (! str_contains($sourceTag[0], 'media="(prefers-color-scheme: dark)"')) {
            $problems[] = "{$label}: the <source> is not for prefers-color-scheme: dark";
        } elseif (preg_match('/-dark\.\w+$/', $dark[1] ?? '') !== 1 || preg_match('/-light\.\w+$/', $light[1] ?? '') !== 1) {
            $problems[] = "{$label}: the <source> must name the -dark file and the <img> the -light file";
        } elseif (preg_replace('/-dark(\.\w+)$/', '-light$1', $dark[1]) !== $light[1]) {
            $problems[] = "{$label}: the <source> and the <img> name different images";
        }
    }

    foreach ($files as $file) {
        if (! in_array($file, $named, true)) {
            $problems[] = "{$file} is in art/ but the README does not use it";
        }
    }

    return array_values(array_unique($problems));
}

/** @return list<string> */
function artFiles(): array
{
    $files = array_map('basename', glob(Pages::root().'/art/*') ?: []);

    return array_values(array_diff($files, ['README.md', 'social-preview.png']));
}

it('names only files that are in art/, with alt text, both themes, and no orphans', function () {
    $readme = Pages::read(Pages::root().'/README.md');

    expect(artNamed($readme))->not->toBeEmpty()
        ->and(artProblems($readme, artFiles()))->toBe([]);
});

it('gives the screenshots and the social preview the size they are taken at', function () {
    $wrong = [];

    foreach (glob(Pages::root().'/art/*.png') ?: [] as $file) {
        $size = getimagesize($file);
        $expected = basename($file) === 'social-preview.png' ? [1280, 640] : [2880, 1800];

        if ($size === false || [$size[0], $size[1]] !== $expected) {
            $wrong[] = basename($file).' is '.($size === false ? 'not an image' : "{$size[0]}x{$size[1]}").', not '.implode('x', $expected);
        }
    }

    expect(file_exists(Pages::root().'/art/social-preview.png'))->toBeTrue()
        ->and(glob(Pages::root().'/art/*-light.png'))->not->toBeEmpty()
        ->and($wrong)->toBe([]);
});

it('notices a missing file, a missing alt text, a lost variant and an orphan', function () {
    $good = <<<'HTML'
        <picture>
          <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/astrophp/trail/main/art/a-dark.png">
          <img src="https://raw.githubusercontent.com/astrophp/trail/main/art/a-light.png" alt="A thing" width="100">
        </picture>
        HTML;
    $files = ['a-light.png', 'a-dark.png'];

    expect(artProblems($good, $files))->toBe([])
        ->and(artProblems($good, ['a-light.png']))->toBe(['a-dark.png is not in art/'])
        ->and(artProblems(str_replace('alt="A thing"', 'alt=""', $good), $files))->toBe([ART_URL.'a-light.png has no alt text'])
        ->and(artProblems(str_replace(' alt="A thing"', '', $good), $files))->toBe([ART_URL.'a-light.png has no alt text'])
        ->and(artProblems(preg_replace('/<source.*>\n/', '', $good), $files))
        ->toBe(['a-light.png has no -dark variant in the README', 'a-light.png: the dark <source> must come before the <img>', 'a-dark.png is in art/ but the README does not use it'])
        ->and(artProblems($good, [...$files, 'old.png']))->toBe(['old.png is in art/ but the README does not use it']);
});

it('notices an image that is not an absolute URL on main, and a picture put together wrongly', function () {
    $good = <<<'HTML'
        <picture>
          <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/astrophp/trail/main/art/a-dark.png">
          <img src="https://raw.githubusercontent.com/astrophp/trail/main/art/a-light.png" alt="A thing" width="100">
        </picture>
        HTML;
    $files = ['a-light.png', 'a-dark.png'];
    $problems = fn (string $readme) => artProblems($readme, $files);

    expect($problems(str_replace('https://raw.githubusercontent.com/astrophp/trail/main/', '', $good)))->not->toBe([])
        ->and($problems(str_replace('/main/art/a-light', '/dev/art/a-light', $good)))
        ->toContain('https://raw.githubusercontent.com/astrophp/trail/dev/art/a-light.png is an art/ image but not an absolute URL on main')
        ->and($problems(preg_replace('#^(\s*)(<source.*>)\n(\s*)(<img.*>)#m', '$1$4'."\n".'$3$2', $good)))
        ->toContain('a-light.png: the dark <source> must come before the <img>')
        ->and($problems(str_replace('a-dark.png', 'a-light.png', $good)))
        ->toContain('a-light.png: the <source> must name the -dark file and the <img> the -light file')
        ->and($problems(str_replace('(prefers-color-scheme: dark)', '(min-width: 600px)', $good)))
        ->toContain('a-light.png: the <source> is not for prefers-color-scheme: dark')
        ->and($problems(str_replace('srcset="https://raw.githubusercontent.com/astrophp/trail/main/art/a-dark.png"', 'srcset="https://raw.githubusercontent.com/astrophp/trail/main/art/b-dark.png"', $good)))
        ->toContain('a-light.png: the <source> and the <img> name different images');
});
