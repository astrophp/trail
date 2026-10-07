<?php

namespace Astro\Trail\Tests\Fixtures\Capture\Hardening;

use Astro\Trail\Tests\Fixtures\Agents\AssistantAgent;
use Astro\Trail\Tests\Fixtures\Agents\ResearcherAgent;
use Astro\Trail\Tests\Fixtures\Capture\Streams;
use Astro\Trail\Tests\Fixtures\Sdk\FakeAnthropic;
use Astro\Trail\Tests\Fixtures\Tools\CallbackTool;
use Astro\Trail\Tests\Fixtures\Tools\LookupTool;
use Closure;
use Illuminate\Support\Facades\Http;
use Laravel\Ai\Embeddings;
use Throwable;

/**
 * The run shapes every hardening test drives. Each scenario scripts the provider, makes the call
 * the way a developer would and returns what the call returned (or the exception it threw), so a
 * test can compare a run with Trail against the same run without it.
 */
final class Scenarios
{
    /**
     * @return array<string, Closure(): mixed>
     */
    public static function all(): array
    {
        return [
            'plain run with tools' => self::plain(...),
            'streamed run' => self::streamed(...),
            'failing run' => self::failing(...),
            'sub-agent and embeddings' => self::nested(...),
            'standalone embeddings' => self::embeddings(...),
        ];
    }

    public static function openai(): void
    {
        Http::fake(['api.openai.com/*' => Http::response([
            'data' => [['embedding' => [0.1, 0.2]], ['embedding' => [0.3, 0.4]]],
            'usage' => ['prompt_tokens' => 7, 'total_tokens' => 7],
        ])]);
    }

    /** Three steps and two tool calls. Returns the response text. */
    public static function plain(): mixed
    {
        FakeAnthropic::script([
            FakeAnthropic::toolUse([['id' => 'toolu_1', 'name' => 'lookup', 'input' => ['query' => 'a']]], usage: ['input_tokens' => 100, 'output_tokens' => 20]),
            FakeAnthropic::toolUse([['id' => 'toolu_2', 'name' => 'lookup', 'input' => ['query' => 'b']]], usage: ['input_tokens' => 120, 'output_tokens' => 20]),
            FakeAnthropic::text('Done', usage: ['input_tokens' => 140, 'output_tokens' => 5]),
        ]);

        return (new AssistantAgent([new LookupTool]))->prompt('Hi', model: FakeAnthropic::MODEL)->text;
    }

    /** Two steps, one tool call, iterated to the end. Returns the received event classes. */
    public static function streamed(): mixed
    {
        FakeAnthropic::script([
            FakeAnthropic::toolUse([['id' => 'toolu_1', 'name' => 'lookup', 'input' => ['query' => 'x']]], text: 'Let me look'),
            FakeAnthropic::text('Done now'),
        ]);

        return Streams::drain((new AssistantAgent([new LookupTool]))->stream('Hi', model: FakeAnthropic::MODEL));
    }

    /** A provider error. Returns the class and message of the exception. */
    public static function failing(): mixed
    {
        FakeAnthropic::script([FakeAnthropic::error(429, 'Slow down')]);

        try {
            (new AssistantAgent)->prompt('Hi', model: FakeAnthropic::MODEL);
        } catch (Throwable $e) {
            return [$e::class, $e->getMessage()];
        }

        return 'no exception';
    }

    /** A parent that delegates to a sub-agent and then embeds from a tool. */
    public static function nested(): mixed
    {
        self::openai();

        FakeAnthropic::script([
            FakeAnthropic::toolUse([['id' => 'toolu_1', 'name' => 'ResearcherAgent', 'input' => ['task' => 'Dig']]]),
            FakeAnthropic::text('found it'),
            FakeAnthropic::toolUse([['id' => 'toolu_2', 'name' => 'embed', 'input' => ['query' => 'x']]]),
            FakeAnthropic::text('Done'),
        ]);

        $embed = new CallbackTool('embed', fn () => (string) count(Embeddings::for(['a', 'b'])->generate()));

        return (new AssistantAgent([new ResearcherAgent, $embed]))->prompt('Hi', model: FakeAnthropic::MODEL)->text;
    }

    public static function embeddings(): mixed
    {
        self::openai();

        return count(Embeddings::for(['a', 'b'])->generate());
    }

    /** The run shape every test that needs "any run" uses. Returns the response text. */
    public static function hello(): string
    {
        AssistantAgent::fake(['Hello']);

        return (new AssistantAgent)->prompt('Hi')->text;
    }
}
