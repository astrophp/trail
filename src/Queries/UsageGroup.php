<?php

namespace Astro\Trail\Queries;

/**
 * One row of the usage breakdown as the grouped read found it: a model, a provider or an agent, with
 * what its runs used. A token count nobody reported is null, and so is an amount nothing priced.
 */
final readonly class UsageGroup
{
    /**
     * @param  array{input: ?int, output: ?int, cache_read: ?int, cache_write: ?int, reasoning: ?int}  $tokens
     * @param  int  $costUnpricedSteps  steps that reported usage and could not be priced, as the cost's state counts them
     * @param  ?int  $unpricedTokens  the input and output tokens of those steps, null when none of them reported either
     */
    public function __construct(
        public ?string $provider,
        public ?string $model,
        public ?string $agent,
        public int $runs,
        public int $steps,
        public array $tokens,
        public ?float $cost,
        public int $costUnpricedSteps,
        public bool $running,
        public int $reportedSteps,
        public int $unpricedSteps,
        public ?int $unpricedTokens,
    ) {}

    /**
     * The input and output tokens, added the way a run's total is; null when neither was reported.
     */
    public function totalTokens(): ?int
    {
        return $this->tokens['input'] === null && $this->tokens['output'] === null ? null : ($this->tokens['input'] ?? 0) + ($this->tokens['output'] ?? 0);
    }

    /**
     * What a sort orders by; null when the row has none.
     */
    public function sortValue(string $sort): int|float|null
    {
        return match ($sort) {
            'cost' => $this->cost,
            'tokens' => $this->totalTokens(),
            default => $this->runs,
        };
    }

    /**
     * The parts of the row's name, compared in turn: the provider and then the model, or the agent.
     *
     * @return list<string>
     */
    public function nameParts(): array
    {
        return $this->agent !== null ? [$this->agent] : array_values(array_filter([$this->provider, $this->model], fn (?string $part) => $part !== null));
    }
}
