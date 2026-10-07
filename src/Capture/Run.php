<?php

namespace Astro\Trail\Capture;

use Astro\Trail\Enums\ErrorSource;
use Throwable;
use WeakReference;

/**
 * The state of one agent invocation: its agent span, the step currently open and how many
 * attempts (providers tried) it has made.
 */
final class Run
{
    /**
     * @param  WeakReference<Throwable>|null  $failure
     */
    public function __construct(
        public readonly string $invocationId,
        public readonly RunBuffer $buffer,
        public readonly SpanDraft $span,
        public int $attempt = 1,
        public ?SpanDraft $step = null,
        public int $failovers = 0,
        public bool $streamed = false,
        public ?string $lastText = null,
        private ?WeakReference $failure = null,
        private ?ErrorSource $failureSource = null,
    ) {}

    /**
     * Remember the last failure of the current attempt. The exception is held weakly: Trail never
     * keeps the developer's exception alive.
     */
    public function remember(Throwable $exception, ErrorSource $source): void
    {
        $this->failure = WeakReference::create($exception);
        $this->failureSource = $source;
    }

    public function forgetFailure(): void
    {
        $this->failure = null;
        $this->failureSource = null;
    }

    /**
     * Where the given exception was first seen failing, or the run itself when it was not seen at all.
     */
    public function sourceOf(Throwable $exception): ErrorSource
    {
        return $this->failure?->get() === $exception ? ($this->failureSource ?? ErrorSource::Run) : ErrorSource::Run;
    }

    public function isRoot(): bool
    {
        return $this->buffer->id === $this->invocationId;
    }
}
