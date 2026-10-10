<?php

namespace Astro\Trail\Tests\Fixtures\Docs;

use RuntimeException;

/**
 * Reads the Markdown pages of the documentation: the pages that are written by hand for people who
 * use Trail, not the contract pages for people who work on it.
 */
final class Pages
{
    /** @return list<string> absolute paths */
    public static function all(): array
    {
        $root = self::root();
        $pages = [$root.'/README.md', $root.'/CONTRIBUTING.md', $root.'/CHANGELOG.md', $root.'/ROADMAP.md'];

        foreach (glob($root.'/docs/*.md') ?: [] as $page) {
            $pages[] = $page;
        }

        return $pages;
    }

    /** @return list<string> the pages whose code samples are run */
    public static function guides(): array
    {
        return array_values(array_filter(
            self::all(),
            fn (string $page) => ! in_array(basename($page), ['api.md', 'frontend.md', 'CHANGELOG.md', 'ROADMAP.md', 'CONTRIBUTING.md'], true),
        ));
    }

    public static function root(): string
    {
        return dirname(__DIR__, 3);
    }

    public static function read(string $path): string
    {
        $text = file_get_contents($path);

        if ($text === false) {
            throw new RuntimeException("Cannot read {$path}.");
        }

        return $text;
    }

    /**
     * The fenced blocks of a page, in order: the language, the code, and the name of the sample
     * marker (an HTML comment on the line before the fence), or null when there is none.
     *
     * @return list<array{language: string, code: string, sample: ?string}>
     */
    public static function blocks(string $path): array
    {
        preg_match_all('/(?:<!-- sample: ([\w.\-]+) -->\n)?^```(\w*)\n(.*?)^```$/ms', self::read($path), $matches, PREG_SET_ORDER);

        return array_map(fn (array $match) => [
            'language' => $match[2],
            'code' => $match[3],
            'sample' => $match[1] !== '' ? $match[1] : null,
        ], $matches);
    }

    /**
     * The sample of that name from the guides: its `use` lines and the rest of its code.
     *
     * @return array{uses: string, code: string}
     */
    public static function sample(string $name): array
    {
        foreach (self::guides() as $page) {
            foreach (self::blocks($page) as $block) {
                if ($block['sample'] === $name) {
                    return self::split($block['code']);
                }
            }
        }

        throw new RuntimeException("No documentation sample is named [{$name}].");
    }

    /**
     * Every sample name the guides declare.
     *
     * @return list<string>
     */
    public static function sampleNames(): array
    {
        $names = [];

        foreach (self::guides() as $page) {
            foreach (self::blocks($page) as $block) {
                if ($block['sample'] !== null) {
                    $names[] = $block['sample'];
                }
            }
        }

        return $names;
    }

    /**
     * Splits the `use` lines at the top of a sample from the code after them, because a `use`
     * statement has to come first in the file the sample is run from.
     *
     * @return array{uses: string, code: string}
     */
    private static function split(string $code): array
    {
        $uses = [];
        $rest = [];

        foreach (explode("\n", $code) as $line) {
            if ($rest === [] && (str_starts_with($line, 'use ') || trim($line) === '')) {
                if (str_starts_with($line, 'use ')) {
                    $uses[] = $line;
                }

                continue;
            }

            $rest[] = $line;
        }

        return ['uses' => implode("\n", $uses), 'code' => implode("\n", $rest)];
    }
}
