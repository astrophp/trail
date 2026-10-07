<?php

namespace Astro\Trail\Tests\Fixtures\Capture\Hardening;

use Astro\Trail\Storage\Contracts\TraceStore;
use Astro\Trail\Storage\TraceRecord;
use Closure;
use DateTimeInterface;
use Throwable;

/**
 * A store that keeps nothing but counts, and can be told to fail or to take its time. It holds no
 * trace, so a test of memory measures Trail and not the store.
 */
class CountingStore implements TraceStore
{
    public int $starts = 0;

    public int $stores = 0;

    public int $spans = 0;

    /** @var list<string> */
    public array $stored = [];

    /**
     * @param  (Closure(string, int): void)|null  $onStart  called with the trace id and how many starts came before it
     * @param  (Closure(string, int): void)|null  $onStore  called with the trace id and how many stores came before it
     * @param  bool  $keepIds  whether the ids of stored traces are remembered
     */
    public function __construct(
        private readonly ?Closure $onStart = null,
        private readonly ?Closure $onStore = null,
        private readonly bool $keepIds = false,
    ) {}

    /**
     * A store that throws the given throwable from start(), store() or both.
     */
    public static function throwing(Throwable $exception, bool $start = true, bool $store = true, ?int $onlyStoreNumber = null): self
    {
        return new self(
            $start ? fn () => throw clone_throwable($exception) : null,
            $store ? function (string $id, int $before) use ($exception, $onlyStoreNumber) {
                if ($onlyStoreNumber === null || $before + 1 === $onlyStoreNumber) {
                    throw clone_throwable($exception);
                }
            } : null,
        );
    }

    public function start(TraceRecord $trace): void
    {
        $before = $this->starts++;

        if ($this->onStart !== null) {
            ($this->onStart)($trace->id, $before);
        }
    }

    public function store(TraceRecord $trace, array $spans): void
    {
        $before = $this->stores++;

        if ($this->onStore !== null) {
            ($this->onStore)($trace->id, $before);
        }

        $this->spans += count($spans);

        if ($this->keepIds) {
            $this->stored[] = $trace->id;
        }
    }

    public function sweep(int $olderThanSeconds): int
    {
        return 0;
    }

    public function prune(DateTimeInterface $before): int
    {
        return 0;
    }

    public function clear(): void {}
}

/**
 * A fresh instance of the throwable, so each throw has its own stack.
 */
function clone_throwable(Throwable $exception): Throwable
{
    $class = $exception::class;

    return new $class($exception->getMessage());
}
