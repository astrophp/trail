<?php

namespace Astro\Trail\Tests\Fixtures\Sdk;

use Illuminate\Support\Facades\Event;
use Laravel\Ai\Gateway\ParentInvocation;
use PHPUnit\Framework\Assert;

/**
 * Records every Laravel\Ai\Events\* event in dispatch order.
 */
class EventLog
{
    /**
     * @param  list<RecordedEvent>  $entries
     */
    public function __construct(protected array $entries = []) {}

    public static function start(): self
    {
        $log = new self;

        Event::listen('Laravel\Ai\Events\*', function (string $name, array $payload) use ($log): void {
            $log->entries[] = RecordedEvent::capture($payload[0], ParentInvocation::current());
        });

        return $log;
    }

    /**
     * @return list<RecordedEvent>
     */
    public function all(): array
    {
        return $this->entries;
    }

    /**
     * Event class basenames, in order: ['PromptingAgent', 'StartingStep', ...].
     *
     * @return list<string>
     */
    public function names(): array
    {
        return array_map(fn (RecordedEvent $entry): string => $entry->name, $this->entries);
    }

    /**
     * Like names(), with step numbers and tool names: ['PromptingAgent', 'StartingStep#0', 'InvokingTool(lookup)', ...].
     *
     * @return list<string>
     */
    public function timeline(): array
    {
        return array_map(fn (RecordedEvent $entry): string => $entry->label(), $this->entries);
    }

    /**
     * The entries whose event is exactly the given class (subclasses are not included).
     *
     * @return list<RecordedEvent>
     */
    public function of(string $class): array
    {
        return array_values(array_filter($this->entries, fn (RecordedEvent $entry): bool => $entry->is($class)));
    }

    /**
     * The only entry for the given event class; fails the test when there are none or several.
     */
    public function sole(string $class): RecordedEvent
    {
        $entries = $this->of($class);

        Assert::assertCount(1, $entries, 'Expected exactly one '.class_basename($class).' event, saw: '.implode(', ', $this->timeline()));

        return $entries[0];
    }

    /**
     * A log holding only the events of one invocation.
     */
    public function forInvocation(string $invocationId): self
    {
        return new self(array_values(array_filter(
            $this->entries,
            fn (RecordedEvent $entry): bool => $entry->invocationId === $invocationId,
        )));
    }

    /**
     * The distinct invocation ids seen, in order of first appearance.
     *
     * @return list<string>
     */
    public function invocationIds(): array
    {
        return array_values(array_unique(array_filter(array_map(
            fn (RecordedEvent $entry): ?string => $entry->invocationId,
            $this->entries,
        ))));
    }

    public function clear(): void
    {
        $this->entries = [];
    }
}
