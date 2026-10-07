<?php

namespace Astro\Trail\Capture;

use Astro\Trail\RecordingCandidate;
use Closure;
use Illuminate\Contracts\Cache\Factory as Cache;
use Illuminate\Contracts\Config\Repository;
use InvalidArgumentException;
use Throwable;

/**
 * Decides whether a top-level run is recorded. The decision is made once, when the run starts, and
 * everything the run does follows it.
 */
class Sampler
{
    /** The cache key that pauses recording in every process. */
    public const PAUSE_KEY = 'trail:paused';

    /** How long a process trusts what it last read of the pause flag when it never reaches a flush point. */
    private const REFRESH_NANOSECONDS = 5_000_000_000;

    private readonly float $rate;

    /** @var Closure(): float */
    private readonly Closure $draw;

    /** @var Closure(): int */
    private readonly Closure $clock;

    /** @var (Closure(RecordingCandidate): mixed)|null */
    private ?Closure $filter = null;

    private int $withoutRecording = 0;

    private ?bool $paused = null;

    private int $pausedReadAt = 0;

    /**
     * @param  (Closure(): float)|null  $draw  a uniform random number in [0, 1); replaceable in tests
     * @param  (Closure(): int)|null  $clock  a monotonic time in nanoseconds; replaceable in tests
     */
    public function __construct(private readonly Repository $config, private readonly Cache $cache, ?Closure $draw = null, ?Closure $clock = null)
    {
        $this->rate = self::rateFrom($this->config->get('trail.sampling', 1.0));
        $this->draw = $draw ?? fn (): float => random_int(0, (1 << 53) - 1) / (1 << 53);
        $this->clock = $clock ?? fn (): int => hrtime(true);
    }

    /**
     * @param  RecordingCandidate|Closure(): RecordingCandidate  $candidate  a closure is only called when there is a filter to show it to
     */
    public function records(RecordingCandidate|Closure $candidate): bool
    {
        if ($this->withoutRecording > 0 || $this->isPaused()) {
            return false;
        }

        if ($this->filter !== null && $this->filtered($candidate instanceof Closure ? $candidate() : $candidate) === false) {
            return false;
        }

        if ($this->rate >= 1.0) {
            return true;
        }

        return $this->rate > 0.0 && ($this->draw)() < $this->rate;
    }

    /**
     * @param  (Closure(RecordingCandidate): mixed)|null  $filter
     */
    public function filter(?Closure $filter): void
    {
        $this->filter = $filter;
    }

    /**
     * Whether runs that start now are not recorded, because a withoutRecording callback or the
     * filter is running. A sub-agent or an embeddings call that starts now is left out too, even
     * under a run that is being recorded.
     */
    public function suppressed(): bool
    {
        return $this->withoutRecording > 0;
    }

    /**
     * Whether a filter is set, so a caller can avoid building what only a filter looks at.
     */
    public function hasFilter(): bool
    {
        return $this->filter !== null;
    }

    /**
     * Run the callback with recording off for every run that starts inside it.
     *
     * @param  Closure(): mixed  $callback
     */
    public function without(Closure $callback): mixed
    {
        $this->withoutRecording++;

        try {
            return $callback();
        } finally {
            $this->withoutRecording--;
        }
    }

    /**
     * A warning for when the default cache store cannot carry the pause flag to other processes.
     */
    public function localFlagWarning(): ?string
    {
        $store = $this->config->get('cache.default');
        $driver = is_string($store) ? $this->config->get("cache.stores.{$store}.driver") : null;

        if (! is_string($store) || ! in_array($driver, ['array', 'null'], true)) {
            return null;
        }

        return "The default cache store [{$store}] uses the [{$driver}] driver, so this only affects the current process. Use a store that processes share, such as redis, memcached, database or file.";
    }

    public function pause(): void
    {
        $this->cache->store()->forever(self::PAUSE_KEY, true);
    }

    public function resume(): void
    {
        $this->cache->store()->forget(self::PAUSE_KEY);
    }

    /**
     * Called at every flush: the next run reads the pause flag afresh.
     */
    public function flushed(): void
    {
        $this->paused = null;
    }

    /**
     * Whether recording is paused. The flag is read at the first run after a flush, and again at the
     * next run once five seconds have passed since the last read, so a long request or job still
     * notices a pause without a cache read for every run. With the database cache driver each read
     * is a query, issued before the run starts.
     */
    private function isPaused(): bool
    {
        $now = ($this->clock)();

        if ($this->paused !== null && $now - $this->pausedReadAt < self::REFRESH_NANOSECONDS) {
            return $this->paused;
        }

        $this->pausedReadAt = $now;

        try {
            return $this->paused = (bool) $this->cache->store()->get(self::PAUSE_KEY, false);
        } catch (Throwable $e) {
            // A cache that cannot be read is not a reason to stop recording.
            $this->paused = false;

            Guard::run(function () use ($e): void {
                throw $e;
            });

            return false;
        }
    }

    /**
     * What the application's filter says. A filter that throws is reported and does not skip the run.
     */
    private function filtered(RecordingCandidate $candidate): mixed
    {
        $filter = $this->filter;

        if ($filter === null) {
            return true;
        }

        // Runs the filter itself starts are not recorded and not shown to the filter again.
        $this->withoutRecording++;

        try {
            return $filter($candidate);
        } catch (Throwable $e) {
            Guard::run(function () use ($e): void {
                throw $e;
            });

            return true;
        } finally {
            $this->withoutRecording--;
        }
    }

    private static function rateFrom(mixed $value): float
    {
        if (! is_numeric($value)) {
            Guard::run(function (): void {
                throw new InvalidArgumentException('Trail ignored trail.sampling: it must be a number from 0 to 1. All runs are recorded.');
            });

            return 1.0;
        }

        return min(1.0, max(0.0, (float) $value));
    }
}
