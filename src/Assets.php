<?php

namespace Astro\Trail;

use RuntimeException;

/**
 * The built dashboard files, read from the package's dist directory.
 */
class Assets
{
    public function __construct(private readonly string $directory = __DIR__.'/../dist') {}

    /**
     * The contents of a built file.
     *
     * @param  string  $file  the file name inside dist, such as app.js
     */
    public function read(string $file): string
    {
        $path = $this->directory.'/'.$file;
        $contents = is_file($path) ? file_get_contents($path) : false;

        if ($contents === false) {
            throw new RuntimeException("Unable to load the Trail dashboard file dist/{$file}: it is missing. Run \"npm run build\" in the package.");
        }

        return $contents;
    }
}
