<?php

namespace Astro\Trail\Tests\Fixtures\Capture\Queue;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;

class NoopJob implements ShouldQueue
{
    use Dispatchable;
    use Queueable;

    public function handle(): void {}
}
