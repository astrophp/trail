<?php

namespace Astro\Trail\Tests\Fixtures\Sdk;

use Closure;
use Laravel\Ai\Contracts\Gateway\ClassificationGateway;
use Laravel\Ai\Contracts\Providers\ClassificationProvider;
use Laravel\Ai\Responses\ClassificationResponse;

/** Reentrant calls and arbitrary exceptions, through the real provider concern. */
class ScriptedClassificationGateway implements ClassificationGateway
{
    public function __construct(private Closure $callback) {}

    public function classify(
        ClassificationProvider $provider,
        string $model,
        string|array $state,
        array $questions,
        int $timeout = 30,
        array $providerOptions = [],
        array $attachments = [],
    ): ClassificationResponse {
        return ($this->callback)($provider, $model, $state, $questions);
    }
}
