<?php

namespace Astro\Trail\Tests\Fixtures\Capture;

use Astro\Trail\Tests\Fixtures\Agents\AssistantAgent;
use Astro\Trail\Tests\Fixtures\Sdk\FakeAnthropic;
use Astro\Trail\Tests\Fixtures\Tools\LookupTool;
use Throwable;

/**
 * Helpers for tests of streamed runs.
 */
final class Streams
{
    /**
     * Iterate a stream and return the class names of the events the consumer received and the
     * exception that ended the iteration, if any. Stops after $stopAfter events when given.
     *
     * @param  iterable<mixed>  $stream
     * @return array{list<string>, ?Throwable}
     */
    public static function drain(iterable $stream, ?int $stopAfter = null): array
    {
        $received = [];

        try {
            foreach ($stream as $event) {
                $received[] = class_basename($event);

                if ($stopAfter !== null && count($received) === $stopAfter) {
                    return [$received, null];
                }
            }
        } catch (Throwable $exception) {
            return [$received, $exception];
        }

        return [$received, null];
    }

    /**
     * Start a run that calls one tool and then answers, read $stopAfter events of it and abandon it.
     * Every reference to the response is dropped when this returns. Returns the invocation id.
     */
    public static function abandonedAfter(int $stopAfter): string
    {
        FakeAnthropic::script([
            FakeAnthropic::toolUse([['id' => 'toolu_1', 'name' => 'lookup', 'input' => ['query' => 'x']]], text: 'Let me look'),
            FakeAnthropic::text('Done now'),
        ]);

        $stream = (new AssistantAgent([new LookupTool]))->stream('Hi', model: FakeAnthropic::MODEL);

        self::drain($stream, $stopAfter);

        return $stream->invocationId;
    }
}
