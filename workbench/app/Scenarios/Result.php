<?php

namespace Workbench\App\Scenarios;

/**
 * What happened when one scenario ran.
 */
final class Result
{
    public function __construct(
        public readonly string $key,
        public readonly Outcome $outcome,
        public readonly string $message,
        public readonly string $mode,
    ) {}

    /**
     * @return array{key: string, outcome: string, message: string, mode: string}
     */
    public function toArray(): array
    {
        return ['key' => $this->key, 'outcome' => $this->outcome->value, 'message' => $this->message, 'mode' => $this->mode];
    }
}
