<?php

namespace Astro\Trail\Mcp\Tools;

use Astro\Trail\Http\Resources\ConversationResource;
use Astro\Trail\Http\Resources\TraceResource;
use Astro\Trail\Queries\ConversationId;
use Astro\Trail\Queries\ConversationIndex;
use Astro\Trail\Queries\Conversations;
use Astro\Trail\Queries\ConversationTurns;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Illuminate\Validation\ValidationException;
use Laravel\Mcp\Request;
use Laravel\Mcp\Response;
use Laravel\Mcp\Server\Tool;
use Laravel\Mcp\Server\Tools\Annotations\IsReadOnly;

#[IsReadOnly]
class TrailShowConversation extends Tool
{
    private const EXCERPT_LIMIT = 2000;

    protected string $description = 'Show a Trail conversation as a bounded page of turn summaries and prompt/response excerpts. Use trail-show-trace for one turn\'s spans. Pass before to page toward older turns.';

    public function __construct(
        private readonly ConversationIndex $index,
        private readonly Conversations $conversations,
        private readonly ConversationTurns $turns,
    ) {}

    public function schema(JsonSchema $schema): array
    {
        return [
            'id' => $schema->string()->description('Exact conversation ID from a Trail trace.')->required(),
            'limit' => $schema->integer()->description('Number of turns, from 1 to 10. Defaults to 5.'),
            'before' => $schema->string()->description('Optional trace ID; return turns before this turn.'),
        ];
    }

    public function handle(Request $request): Response
    {
        try {
            $arguments = $request->validate([
                'id' => ['required', 'string', 'max:255'],
                'limit' => ['sometimes', 'integer', 'between:1,10'],
                'before' => ['sometimes', 'string', 'max:64'],
            ]);
        } catch (ValidationException $exception) {
            return Response::error(implode(' ', $exception->validator->errors()->all()));
        }

        $id = $arguments['id'] ?? null;

        if (! is_string($id) || ! ConversationId::isPossible($id) || ($resolved = $this->index->exact($id)) === null) {
            return Response::error('Trail conversation not found.');
        }

        $summary = $this->conversations->summaries([$resolved])[0] ?? null;

        if ($summary === null) {
            return Response::error('Trail conversation not found.');
        }

        $before = $arguments['before'] ?? null;
        $anchor = null;

        if ($before !== null) {
            if (! is_string($before) || ($anchor = $this->turns->anchor($resolved, $before)) === null) {
                return Response::error('The before trace is not a turn of this conversation.');
            }
        }

        $limit = $arguments['limit'] ?? 5;
        $limit = is_int($limit) ? $limit : 5;
        $traces = $this->turns->window($resolved, $limit, $anchor === null ? null : 'before', $anchor);
        $first = $traces->first();
        $last = $traces->last();
        $outside = $first !== null && $last !== null
            ? $this->turns->beyond($resolved, $first->id, $last->id)
            : ['older' => 0, 'newer' => $summary->turns['all']];

        $conversation = ConversationResource::of([$summary])->toArray($summary);
        unset($conversation['users'], $conversation['prompt_excerpt']);

        $turns = array_map(static function (array $trace): array {
            $prompt = $trace['prompt_excerpt'];
            $response = $trace['response_excerpt'];

            return array_intersect_key($trace, array_flip([
                'id', 'name', 'status', 'issue_kind', 'provider', 'model', 'duration_ms',
                'usage', 'cost', 'started_at',
            ])) + [
                'prompt_excerpt' => self::excerpt($prompt),
                'response_excerpt' => self::excerpt($response),
                'prompt_cut_by_tool' => is_string($prompt) && mb_strlen($prompt) > self::EXCERPT_LIMIT,
                'response_cut_by_tool' => is_string($response) && mb_strlen($response) > self::EXCERPT_LIMIT,
            ];
        }, TraceResource::of($traces)->collection($traces));

        return Response::json([
            'conversation' => $conversation,
            'turns' => $turns,
            'window' => $outside,
            'next_before' => $outside['older'] > 0 ? $first?->id : null,
        ]);
    }

    private static function excerpt(mixed $text): ?string
    {
        return is_string($text) ? mb_substr($text, 0, self::EXCERPT_LIMIT) : null;
    }
}
