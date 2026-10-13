<?php

namespace Astro\Trail\Tests\Fixtures\Sdk;

use Closure;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use RuntimeException;

/** Scripts HTTP below the real SDK gateway; each turn is consumed exactly once. */
class FakeCohere
{
    /** @var list<array<string, mixed>> */
    public array $requests = [];

    /** @var list<string> */
    public array $urls = [];

    /** @param list<array<string, mixed>|Closure> $turns */
    private function __construct(private array $turns) {}

    /** @param list<array<string, mixed>|Closure> $turns */
    public static function script(array $turns): self
    {
        $fake = new self($turns);

        Http::fake(array_fill_keys(['api.cohere.com/*', 'rerank-backup.test/*'], function (Request $request) use ($fake) {
            $fake->requests[] = $request->data();
            $fake->urls[] = $request->url();
            $turn = array_shift($fake->turns) ?? throw new RuntimeException('FakeCohere received an unscripted request.');

            if ($turn instanceof Closure) {
                $turn = $turn($request);
            }

            return Http::response($turn['body'], $turn['status'] ?? 200);
        }));

        return $fake;
    }

    /** @param array<string, mixed> $body */
    public static function response(array $body): array
    {
        return ['body' => $body];
    }

    public static function error(int $status): array
    {
        return ['status' => $status, 'body' => ['error' => ['message' => 'Scripted provider failure.']]];
    }

    public function remaining(): int
    {
        return count($this->turns);
    }
}
