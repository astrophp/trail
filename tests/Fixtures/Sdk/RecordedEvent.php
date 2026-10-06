<?php

namespace Astro\Trail\Tests\Fixtures\Sdk;

use Laravel\Ai\Responses\AgentResponse;
use Laravel\Ai\Tools\ToolNameResolver;

/**
 * One SDK event as it looked at the moment it was dispatched.
 *
 * Events carry live objects (the agent, the prompt, the response) that keep changing after the
 * dispatch, so anything a test asserts "at the time of the event" is copied here.
 */
class RecordedEvent
{
    /**
     * @param  array{?string, ?string}  $parentInvocation  ParentInvocation::current() during the dispatch
     */
    public function __construct(
        public readonly string $name,
        public readonly object $event,
        public readonly ?string $invocationId,
        public readonly array $parentInvocation,
        public readonly ?string $agentConversationId,
        public readonly ?object $agentConversationUser,
        public readonly ?string $responseConversationId,
    ) {}

    public static function capture(object $event, array $parentInvocation): self
    {
        $agent = $event->agent ?? $event->prompt->agent ?? null;
        $remembers = is_object($agent) && method_exists($agent, 'currentConversation');
        $response = $event->response ?? null;

        return new self(
            name: class_basename($event),
            event: $event,
            invocationId: $event->invocationId ?? null,
            parentInvocation: $parentInvocation,
            agentConversationId: $remembers ? $agent->currentConversation() : null,
            agentConversationUser: $remembers ? $agent->conversationParticipant() : null,
            responseConversationId: $response instanceof AgentResponse
                ? $response->conversationId
                : ($event->conversationId ?? null),
        );
    }

    /**
     * The event name with the detail that tells repeated events apart: "StartingStep#0", "InvokingTool(lookup)".
     */
    public function label(): string
    {
        return match (true) {
            isset($this->event->stepNumber) => $this->name.'#'.$this->event->stepNumber,
            isset($this->event->tool) => $this->name.'('.ToolNameResolver::resolve($this->event->tool).')',
            default => $this->name,
        };
    }

    public function is(string $class): bool
    {
        return $class === $this->event::class;
    }
}
