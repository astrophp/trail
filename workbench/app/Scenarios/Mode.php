<?php

namespace Workbench\App\Scenarios;

/**
 * Whether scenarios run offline or against a real provider, decided by which key is set.
 */
final class Mode
{
    /** @var list<string> The providers tried, in order, when looking for a key. */
    private const PROVIDERS = ['anthropic', 'openai'];

    private function __construct(public readonly ?string $provider) {}

    public static function detect(): self
    {
        foreach (self::PROVIDERS as $provider) {
            $key = config("ai.providers.{$provider}.key");

            if (is_string($key) && $key !== '' && $key !== Backend::PLACEHOLDER_KEY) {
                return new self($provider);
            }
        }

        return new self(null);
    }

    public function isLive(): bool
    {
        return $this->provider !== null;
    }

    public function label(): string
    {
        return $this->provider === null ? 'offline' : "live ({$this->provider})";
    }
}
