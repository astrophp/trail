<?php

namespace Astro\Trail\Tests\Fixtures\Sdk;

use Closure;
use Laravel\Ai\Contracts\Gateway\RerankingGateway;
use Laravel\Ai\Contracts\Providers\RerankingProvider;
use Laravel\Ai\Responses\RerankingResponse;

/** Reentrant calls and arbitrary exceptions, through the real provider concern. */
class ScriptedRerankingGateway implements RerankingGateway
{
    public function __construct(private Closure $callback) {}

    public function rerank(
        RerankingProvider $provider,
        string $model,
        array $documents,
        string $query,
        ?int $limit = null,
        int $timeout = 30,
        array $providerOptions = [],
    ): RerankingResponse {
        return ($this->callback)($provider, $model, $documents, $query);
    }
}
