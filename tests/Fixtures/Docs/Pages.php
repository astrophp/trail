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
     * The fenced blocks of a page, in order: the language and the code.
     *
     * @return list<array{language: string, code: string}>
     */
    public static function blocks(string $path): array
    {
        preg_match_all('/^```(\w*)\n(.*?)^```$/ms', self::read($path), $matches, PREG_SET_ORDER);

        return array_map(fn (array $match) => [
            'language' => $match[1],
            'code' => $match[2],
        ], $matches);
    }
}
