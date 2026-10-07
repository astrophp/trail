<?php

namespace Workbench\App\Scenarios;

use Astro\Trail\Tests\Fixtures\Sdk\FakeAnthropic;
use Closure;
use Illuminate\Http\Client\Factory as HttpFactory;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;

/**
 * Where a scenario's model calls go: scripted responses served underneath the SDK's real
 * gateways, or the real provider.
 *
 * Offline, the provider's HTTP API is what is scripted, so request building, response and stream
 * parsing, usage and error mapping, failover and the step loop all run for real. The script lives
 * on a fresh HTTP client for the length of one scenario and the client is put back afterwards, so
 * nothing outlives the scenario, and a call nobody scripted fails instead of reaching the network.
 */
final class Backend
{
    /** The key offline runs hand the SDK so its gateways accept a request; nothing is ever sent with it. */
    public const PLACEHOLDER_KEY = 'workbench-offline';

    /** @var list<FakeAnthropic> */
    private array $scripts = [];

    private function __construct(public readonly ?string $provider) {}

    public static function offline(): self
    {
        return new self(null);
    }

    public static function live(string $provider): self
    {
        return new self($provider);
    }

    public function isLive(): bool
    {
        return $this->provider !== null;
    }

    /**
     * Script the provider's next responses, in order. A live run ignores the script.
     *
     * @param  list<array<string, mixed>>  $turns
     */
    public function script(array $turns): void
    {
        if (! $this->isLive()) {
            $this->scripts[] = FakeAnthropic::script($turns);
        }
    }

    /**
     * How many scripted responses no request asked for.
     */
    public function unusedTurns(): int
    {
        return array_sum(array_map(fn (FakeAnthropic $script): int => $script->remaining(), $this->scripts));
    }

    /**
     * Run the callback with this backend's configuration and, offline, its own HTTP client.
     *
     * @template T
     *
     * @param  Closure(): T  $callback
     * @return T
     */
    public function scoped(Closure $callback): mixed
    {
        $this->configure();

        if ($this->isLive()) {
            return $callback();
        }

        $original = Http::getFacadeRoot();
        $this->forgetScript();

        Http::swap(new HttpFactory(app('events')));
        Http::preventStrayRequests();
        $this->fakeEmbeddings();

        try {
            return $callback();
        } finally {
            Http::swap($original);
            $this->forgetScript();
        }
    }

    private function configure(): void
    {
        config(['ai.conversations.generate_title' => false]);

        if ($this->isLive()) {
            config(['ai.default' => $this->provider]);

            return;
        }

        config([
            'ai.default' => 'anthropic',
            'ai.default_for_embeddings' => 'openai',
            'ai.providers.backup' => ['driver' => 'anthropic', 'key' => self::PLACEHOLDER_KEY, 'url' => 'https://backup.anthropic.test/v1'],
        ]);

        foreach (['anthropic', 'openai'] as $provider) {
            if (! is_string(config("ai.providers.{$provider}.key")) || config("ai.providers.{$provider}.key") === '') {
                config(["ai.providers.{$provider}.key" => self::PLACEHOLDER_KEY]);
            }
        }
    }

    /**
     * FakeAnthropic registers its stub once per application; the next scenario needs it registered again.
     */
    private function forgetScript(): void
    {
        app()->offsetUnset(FakeAnthropic::class);
    }

    /**
     * Answer embeddings requests with a small vector per input and a plausible token count.
     */
    private function fakeEmbeddings(): void
    {
        Http::fake(['api.openai.com/*' => function (Request $request) {
            $inputs = array_values((array) ($request->data()['input'] ?? []));

            return Http::response([
                'data' => array_map(fn (string $input): array => ['embedding' => $this->vector($input)], $inputs),
                'usage' => ['prompt_tokens' => array_sum(array_map(fn (string $input): int => max(1, intdiv(strlen($input), 4)), $inputs))],
            ]);
        }]);
    }

    /**
     * @return list<float>
     */
    private function vector(string $text): array
    {
        $hash = md5($text);

        return array_map(fn (int $position): float => round(hexdec(substr($hash, $position * 4, 4)) / 65535, 4), range(0, 5));
    }
}
