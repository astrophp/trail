<?php

use Astro\Trail\Capture\Failure;
use Astro\Trail\Enums\ErrorSource;
use Astro\Trail\Enums\IssueKind;
use GuzzleHttp\Psr7\Response as PsrResponse;
use Illuminate\Http\Client\RequestException;
use Illuminate\Http\Client\Response;
use Laravel\Ai\Exceptions\InsufficientCreditsException;
use Laravel\Ai\Exceptions\ProviderConnectionException;
use Laravel\Ai\Exceptions\ProviderOverloadedException;
use Laravel\Ai\Exceptions\RateLimitedException;

function httpError(int $status): RequestException
{
    return new RequestException(new Response(new PsrResponse($status)));
}

it('takes the HTTP status from a request exception anywhere in the previous chain', function () {
    $exception = new ProviderOverloadedException('overloaded', 0, new RuntimeException('wrapper', 0, httpError(503)));

    $failure = Failure::from($exception, ErrorSource::Step);

    expect($failure->httpStatus)->toBe(503)
        ->and($failure->issueKind)->toBe(IssueKind::ProviderOverloaded)
        ->and($failure->source)->toBe(ErrorSource::Step)
        ->and($failure->errorMessage)->toBe('overloaded');
});

it('prefers the response status over the exception code', function () {
    expect(Failure::from(new RateLimitedException('limited', 429, httpError(503)), ErrorSource::Step)->httpStatus)->toBe(503);
});

it('uses the code of a mapped exception that has no response behind it', function () {
    expect(Failure::from(RateLimitedException::forProvider('x', 429), ErrorSource::Step)->httpStatus)->toBe(429)
        ->and(Failure::from(InsufficientCreditsException::forProvider('x', 402), ErrorSource::Step)->httpStatus)->toBe(402);
});

it('has no status for a code outside 100 to 599, a zero code or an exception that is not mapped', function () {
    expect(Failure::from(RateLimitedException::forProvider('x', 99), ErrorSource::Step)->httpStatus)->toBeNull()
        ->and(Failure::from(RateLimitedException::forProvider('x', 600), ErrorSource::Step)->httpStatus)->toBeNull()
        ->and(Failure::from(RateLimitedException::forProvider('x'), ErrorSource::Step)->httpStatus)->toBeNull()
        ->and(Failure::from(new RuntimeException('plain', 429), ErrorSource::Step)->httpStatus)->toBeNull()
        ->and(Failure::from(ProviderConnectionException::forProvider('x', 0, new RuntimeException('refused')), ErrorSource::Step)->httpStatus)->toBeNull();
});

it('cuts an anonymous exception class at its file path', function () {
    $failure = Failure::from(new class('boom') extends RuntimeException {}, ErrorSource::Run);

    expect($failure->errorClass)->toBe('RuntimeException@anonymous')
        ->and($failure->issueKind)->toBe(IssueKind::Exception);
});

it('calls a plain exception a tool error only when it came from a tool', function () {
    expect(Failure::from(new RuntimeException, ErrorSource::Tool)->issueKind)->toBe(IssueKind::ToolError)
        ->and(Failure::from(new RuntimeException, ErrorSource::Step)->issueKind)->toBe(IssueKind::Exception)
        ->and(Failure::from(new RuntimeException, ErrorSource::Run)->issueKind)->toBe(IssueKind::Exception)
        ->and(Failure::from(RateLimitedException::forProvider('x'), ErrorSource::Tool)->issueKind)->toBe(IssueKind::RateLimited);
});

it('does not loop on an exception chain that is very long', function () {
    $exception = new RuntimeException('end');

    for ($level = 0; $level < 100; $level++) {
        $exception = new RuntimeException('level '.$level, 0, $exception);
    }

    expect(Failure::from($exception, ErrorSource::Step)->httpStatus)->toBeNull();
});

it('survives a request exception that carries no response', function () {
    $broken = (new ReflectionClass(RequestException::class))->newInstanceWithoutConstructor();

    $failure = Failure::from(new RateLimitedException('limited', 429, $broken), ErrorSource::Step);

    // With no readable response, the mapped exception's own code is all there is.
    expect($failure->httpStatus)->toBe(429)
        ->and($failure->issueKind)->toBe(IssueKind::RateLimited)
        ->and(Failure::from($broken, ErrorSource::Run)->httpStatus)->toBeNull();
});
