<?php

namespace Astro\Trail\Tests\Fixtures\Capture\Hardening;

use Illuminate\Contracts\Debug\ExceptionHandler;
use Throwable;

/**
 * An exception handler that keeps every report, so a test can count them. Unlike
 * Exceptions::fake() it counts every call, and does not skip an exception it has seen before.
 */
final class Reports implements ExceptionHandler
{
    /** @var list<Throwable> */
    public array $reported = [];

    public static function capture(): self
    {
        $reports = new self;

        app()->instance(ExceptionHandler::class, $reports);

        return $reports;
    }

    public function report(Throwable $e): void
    {
        $this->reported[] = $e;
    }

    public function shouldReport(Throwable $e): bool
    {
        return true;
    }

    public function render($request, Throwable $e): never
    {
        throw $e;
    }

    public function renderForConsole($output, Throwable $e): void {}

    public function count(): int
    {
        return count($this->reported);
    }

    /**
     * @return list<string>
     */
    public function messages(): array
    {
        return array_map(fn (Throwable $e): string => $e::class.': '.$e->getMessage(), $this->reported);
    }
}
