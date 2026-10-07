<?php

namespace Astro\Trail\Capture;

use Astro\Trail\Enums\ErrorSource;
use Astro\Trail\Enums\IssueKind;
use Illuminate\Http\Client\RequestException;
use Laravel\Ai\Exceptions\InsufficientCreditsException;
use Laravel\Ai\Exceptions\ProviderConnectionException;
use Laravel\Ai\Exceptions\ProviderOverloadedException;
use Laravel\Ai\Exceptions\RateLimitedException;
use Throwable;

/**
 * What an exception becomes when it is stored: the five error columns of a span or trace.
 */
final readonly class Failure
{
    /** The longest exception chain followed when looking for the HTTP response behind an error. */
    private const MAX_CHAIN = 16;

    public function __construct(
        public string $errorClass,
        public string $errorMessage,
        public ErrorSource $source,
        public ?int $httpStatus,
        public IssueKind $issueKind,
    ) {}

    public static function from(Throwable $exception, ErrorSource $source): self
    {
        return new self(
            explode("\0", $exception::class)[0],
            $exception->getMessage(),
            $source,
            self::httpStatus($exception),
            self::issueKind($exception, $source),
        );
    }

    /**
     * The status of the HTTP response behind the exception, or null when there was none (a
     * connection failure, an error body on a 200, a tool that threw).
     */
    private static function httpStatus(Throwable $exception): ?int
    {
        $current = $exception;

        for ($depth = 0; $current !== null && $depth < self::MAX_CHAIN; $depth++) {
            if ($current instanceof RequestException) {
                $status = self::responseStatus($current);

                if ($status !== null) {
                    return $status;
                }
            }

            $current = $current->getPrevious();
        }

        if (self::isMapped($exception) && $exception->getCode() >= 100 && $exception->getCode() <= 599) {
            return $exception->getCode();
        }

        return null;
    }

    /**
     * Reading the response must never fail: an exception built without one (a subclass, a test
     * double) would otherwise cost the whole failure, and the run would be left looking unfinished.
     */
    private static function responseStatus(RequestException $exception): ?int
    {
        try {
            return $exception->response->status();
        } catch (Throwable) {
            return null;
        }
    }

    private static function isMapped(Throwable $exception): bool
    {
        return $exception instanceof RateLimitedException
            || $exception instanceof ProviderOverloadedException
            || $exception instanceof ProviderConnectionException
            || $exception instanceof InsufficientCreditsException;
    }

    private static function issueKind(Throwable $exception, ErrorSource $source): IssueKind
    {
        return match (true) {
            $exception instanceof RateLimitedException => IssueKind::RateLimited,
            $exception instanceof ProviderOverloadedException => IssueKind::ProviderOverloaded,
            $exception instanceof ProviderConnectionException => IssueKind::ProviderConnection,
            // The SDK matches loosely, so a permissions error can land here; the HTTP status is kept next to it.
            $exception instanceof InsufficientCreditsException => IssueKind::InsufficientCredits,
            $source === ErrorSource::Tool => IssueKind::ToolError,
            default => IssueKind::Exception,
        };
    }
}
