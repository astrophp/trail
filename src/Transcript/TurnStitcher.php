<?php

namespace Astro\Trail\Transcript;

/**
 * Reads the messages of one turn out of its spans.
 *
 * A step stores only the messages its attempt had not sent yet, so a turn's conversation is
 * pieced together: the first step holds everything the model was sent, the rest add what came
 * after, and the output of the last step is the one thing no later input holds. Everything before
 * the message that started the turn is earlier history, which belongs to earlier turns, and is
 * counted but never returned.
 *
 * It is a pure function of the spans: no database, no application. It never invents a message and
 * never repeats one; where the spans do not say enough it returns less and says why.
 */
final class TurnStitcher
{
    /** The reasons a turn is only partly known, in the order that decides which one is reported. */
    private const REASONS = ['span_limit', 'offset_gap', 'history_rewritten', 'history_boundary_unknown', 'step_input_missing'];

    /** @var array<string, true> */
    private array $reasons = [];

    private ?int $historyCount = null;

    /** Whether the turn began with a tool result rather than a prompt. */
    private bool $fromDecisions = false;

    private bool $prompted = false;

    /** Whether the turn ended well: the only turn whose last answer is a response. */
    private bool $completed = false;

    /** The messages of the first stored step, and where this turn starts in them. */
    private int $start = 0;

    /** @var list<mixed> */
    private array $startMessages = [];

    private ?StitchSpan $startSpan = null;

    /** @var list<array{kind: string, span: StitchSpan, part: string, path: string, item?: mixed, index?: int}> */
    private array $emitted = [];

    /** @var list<StitchSpan> */
    private array $level = [];

    /** @var list<StitchSpan> */
    private array $shown = [];

    /** @var array<string, array<int, StitchSpan>> by step id, then call index */
    private array $outputLinks = [];

    /** @var array<string, StitchSpan> by call id */
    private array $linksById = [];

    /** @var array<string, StitchSpan> the first agent under each tool span, by tool span id */
    private array $agentOf = [];

    private StitchSpan $root;

    private int $attempt;

    /**
     * @param  list<StitchSpan>  $spans  the turn's spans, loaded in any order
     * @param  string  $status  the turn's status as the API shows it
     * @param  list<string>  $pendingCallIds  the calls the turn waits for approval on
     * @param  list<string>  $resolvedCallIds  the calls this turn's first message settles
     * @param  bool  $spanLimited  whether the spans are only the first of more
     */
    public static function stitch(array $spans, string $status, array $pendingCallIds, array $resolvedCallIds, bool $spanLimited): Transcript
    {
        usort($spans, fn (StitchSpan $a, StitchSpan $b): int => $a->sequence <=> $b->sequence ?: strcmp($a->id, $b->id));

        $root = null;

        foreach ($spans as $span) {
            if ($span->type === 'agent' && $span->parentId === null) {
                $root = $span;

                break;
            }
        }

        if ($root === null) {
            return Transcript::none();
        }

        return (new self($root))->read($spans, $status, $pendingCallIds, $resolvedCallIds, $spanLimited);
    }

    private function __construct(StitchSpan $root)
    {
        $this->root = $root;
        $this->attempt = $root->attempt;
    }

    /**
     * @param  list<StitchSpan>  $spans
     * @param  list<string>  $pendingCallIds
     * @param  list<string>  $resolvedCallIds
     */
    private function read(array $spans, string $status, array $pendingCallIds, array $resolvedCallIds, bool $spanLimited): Transcript
    {
        foreach ($spans as $span) {
            if ($span->parentId === $this->root->id) {
                $this->level[] = $span;
            }

            if ($span->type === 'agent' && $span->parentId !== null) {
                $this->agentOf[$span->parentId] ??= $span;
            }
        }

        foreach ($this->level as $span) {
            if ($span->type === 'step' && $span->attempt === $this->attempt) {
                $this->shown[] = $span;
            }
        }

        $this->completed = $status === 'completed';
        $this->collect();
        $this->link($resolvedCallIds);

        $messages = [];
        $newest = array_key_last($this->emitted);

        foreach ($this->emitted as $position => $entry) {
            $messages[] = $this->message($entry, $status, $pendingCallIds, $position === $newest && $entry['kind'] === 'output');
        }

        if ($spanLimited) {
            $this->reasons['span_limit'] = true;
        }

        $reason = null;

        foreach (self::REASONS as $candidate) {
            if (isset($this->reasons[$candidate])) {
                $reason = $candidate;

                break;
            }
        }

        $state = match (true) {
            $messages === [] => Transcript::NOT_STORED,
            $reason !== null => Transcript::PARTIAL,
            default => Transcript::STORED,
        };

        return new Transcript(
            $this->root->id,
            $this->attempt,
            $this->attempts(),
            $state,
            $state === Transcript::PARTIAL ? $reason : null,
            $this->historyCount,
            $messages,
        );
    }

    /**
     * Decides which messages the turn holds, in order, without yet knowing what their tool calls ran.
     */
    private function collect(): void
    {
        $sent = 0;
        $seen = false;
        $lastStored = null;

        foreach ($this->shown as $position => $step) {
            if (self::stored($step) !== null) {
                $lastStored = $position;
            }
        }

        foreach ($this->shown as $position => $step) {
            $stored = self::stored($step);

            if ($stored === null) {
                continue;
            }

            [$messages, $offset] = $stored;

            if ($seen) {
                $this->later($step, $messages, $offset, $sent);
            } else {
                // A step recorded without its start event came first: this one is not the turn's first.
                $this->first($step, $messages, $offset, $position > 0);
                $seen = true;
            }

            $sent = $offset + count($messages);
        }

        foreach ($this->shown as $position => $step) {
            if (self::stored($step) === null && ($lastStored === null || $position > $lastStored)) {
                $this->reasons['step_input_missing'] = true;
            }
        }

        // The output of the last stored step, and of the steps after it, is in no later input.
        $outputs = array_slice($this->shown, $lastStored ?? 0, null, true);

        foreach ($outputs as $step) {
            if (is_array($step->output)) {
                $this->emitted[] = ['kind' => 'output', 'span' => $step, 'part' => 'activity', 'path' => 'output'];
            }
        }

        $this->settleResponse();

        if (! $this->prompted && ! $this->fromDecisions) {
            $this->fallbackPrompt();
        }
    }

    /**
     * The first stored step holds everything the model was sent, earlier turns included. The turn
     * starts at its last message, the one thing this turn added to what the conversation already had.
     *
     * @param  list<mixed>  $messages
     */
    private function first(StitchSpan $step, array $messages, int $offset, bool $afterMissing): void
    {
        $this->startSpan = $step;
        $this->startMessages = $messages;

        if ($offset > 0) {
            // The messages before these were sent by a step that is not here; nothing says where this turn began.
            $this->reasons['offset_gap'] = true;
            $this->emitFrom($step, $messages, 0, 'activity');

            return;
        }

        if ($step->cutSomewhereUnknown()) {
            // A cut list is a prefix of what was sent, and nothing says where it ends: its last message
            // may be an old one, not the one that began this turn.
            $this->reasons['history_boundary_unknown'] = true;

            return;
        }

        $role = $messages === [] ? null : self::role($messages[count($messages) - 1]);

        if ($afterMissing) {
            // A step before this one lost its start, so the last message is not where the turn began.
            // The agent's own prompt says whether the turn began from a prompt, and the last user message is it.
            $start = self::prompted($this->root) ? self::lastRole($messages, 'user') : null;

            if ($start === null) {
                $this->reasons['history_boundary_unknown'] = true;

                return;
            }

            $this->begin($step, $messages, $start, 'prompt');

            return;
        }

        if ($role !== 'user' && $role !== 'tool_result') {
            $this->reasons['history_boundary_unknown'] = true;

            return;
        }

        $this->begin($step, $messages, count($messages) - 1, $role === 'user' ? 'prompt' : 'activity');
        $this->fromDecisions = $role === 'tool_result';
    }

    /**
     * @param  list<mixed>  $messages
     */
    private function begin(StitchSpan $step, array $messages, int $start, string $firstPart): void
    {
        $this->start = $start;
        $this->historyCount = $start;
        $this->prompted = $firstPart === 'prompt';
        $this->emitFrom($step, $messages, $start, 'activity', $firstPart);
    }

    /**
     * What a later step adds to the history of the one before it.
     *
     * @param  list<mixed>  $messages
     */
    private function later(StitchSpan $step, array $messages, int $offset, int $sent): void
    {
        if ($step->cutSomewhereUnknown()) {
            // Whatever followed the stored prefix is not here, and the span cannot say how much.
            $this->reasons['offset_gap'] = true;
        }

        if ($offset === $sent) {
            $this->emitFrom($step, $messages, 0, 'activity');

            return;
        }

        if ($offset > $sent) {
            $this->reasons['offset_gap'] = true;
            $this->emitFrom($step, $messages, 0, 'activity');

            return;
        }

        if ($offset === 0) {
            // The history was cut short or rewritten and sent whole again. What came before is kept; only its tail is new.
            $this->reasons['history_rewritten'] = true;
            $tail = self::lastRole($messages, 'assistant');

            if ($tail !== null) {
                $this->emitFrom($step, $messages, $tail, 'activity');
            }

            return;
        }

        $this->reasons['offset_gap'] = true;
        $this->emitFrom($step, $messages, $sent - $offset, 'activity');
    }

    /**
     * @param  list<mixed>  $messages
     */
    private function emitFrom(StitchSpan $step, array $messages, int $from, string $part, ?string $firstPart = null): void
    {
        for ($index = $from; $index < count($messages); $index++) {
            $this->emitted[] = [
                'kind' => 'input', 'span' => $step, 'item' => $messages[$index], 'part' => $index === $from ? ($firstPart ?? $part) : $part,
                'path' => 'input.messages.'.$index, 'index' => $index,
            ];
        }
    }

    /**
     * Only a turn that ended well and asked for no tool answered: its last output is the response.
     */
    private function settleResponse(): void
    {
        $last = count($this->emitted) - 1;

        if ($last < 0 || $this->emitted[$last]['kind'] !== 'output') {
            return;
        }

        $output = $this->emitted[$last]['span']->output;
        $calls = is_array($output) ? ($output['tool_calls'] ?? null) : null;

        if ($this->completed && ($calls === null || $calls === [])) {
            $this->emitted[$last]['part'] = 'response';
        }
    }

    /**
     * A turn that failed before any step started, or whose first step was never recorded, still has
     * the prompt the agent was given.
     */
    private function fallbackPrompt(): void
    {
        if (! self::prompted($this->root)) {
            return;
        }

        array_unshift($this->emitted, ['kind' => 'agent', 'span' => $this->root, 'part' => 'prompt', 'path' => 'input']);

        if ($this->reasons === []) {
            $this->reasons['step_input_missing'] = true;
        }
    }

    /**
     * Links the calls the turn requested to the tool spans that ran them.
     *
     * @param  list<string>  $resolvedCallIds
     */
    private function link(array $resolvedCallIds): void
    {
        $tools = array_values(array_filter($this->level, fn (StitchSpan $span): bool => $span->type === 'tool'));
        $occurrences = [];
        $linked = [];

        foreach ($this->shown as $position => $step) {
            $calls = self::calls($step->output);

            if ($calls === null) {
                continue;
            }

            $next = $this->shown[$position + 1] ?? null;
            $candidates = array_values(array_filter(
                $tools,
                fn (StitchSpan $tool): bool => $tool->attempt === $this->attempt
                    && $tool->sequence > $step->sequence
                    && ($next === null || $tool->sequence < $next->sequence),
            ));

            $trusted = [];

            foreach ($calls as $index => $call) {
                $trusted[$index] = $step->hasTrustworthyCall('output.tool_calls', $index, $call);

                if (is_array($call) && is_string($call['id'] ?? null)) {
                    $occurrences[$call['id']] = ($occurrences[$call['id']] ?? 0) + 1;
                }
            }

            $this->outputLinks[$step->id] = ToolLinker::link($calls, $trusted, $candidates);

            foreach ($this->outputLinks[$step->id] as $index => $span) {
                $linked[] = [$calls[$index], $span];
            }
        }

        // A call inside a stored message takes the link its own request got, by id, if the id belongs to one call only.
        foreach ($linked as [$call, $span]) {
            $id = is_array($call) ? ($call['id'] ?? null) : null;

            if (is_string($id) && ($occurrences[$id] ?? 0) === 1) {
                $this->linksById[$id] = $span;
            }
        }

        if ($this->fromDecisions && $this->startSpan !== null) {
            $this->linkApproved($tools, $resolvedCallIds);
        }
    }

    /**
     * The tools this turn ran before its first step. The calls they answer sit in the history the
     * first step was sent, ahead of the message the turn began at.
     *
     * @param  list<StitchSpan>  $tools
     * @param  list<string>  $resolvedCallIds
     */
    private function linkApproved(array $tools, array $resolvedCallIds): void
    {
        $calls = [];
        $trusted = [];
        $counts = [];

        for ($index = 0; $index < $this->start; $index++) {
            $message = $this->startMessages[$index];
            $listed = is_array($message) && self::role($message) === 'assistant' ? self::calls($message) : null;

            foreach ($listed ?? [] as $position => $call) {
                if (is_array($call) && is_string($call['id'] ?? null) && in_array($call['id'], $resolvedCallIds, true)) {
                    $counts[$call['id']] = ($counts[$call['id']] ?? 0) + 1;
                    $trusted[count($calls)] = $this->startSpan?->hasTrustworthyCall('input.messages.'.$index.'.tool_calls', $position, $call) ?? false;
                    $calls[] = $call;
                }
            }
        }

        $firstStep = array_values(array_filter($this->level, fn (StitchSpan $span): bool => $span->type === 'step'))[0] ?? null;
        $candidates = array_values(array_filter(
            $tools,
            fn (StitchSpan $tool): bool => $firstStep === null || $tool->sequence < $firstStep->sequence,
        ));

        foreach (ToolLinker::link($calls, $trusted, $candidates) as $index => $span) {
            $id = $calls[$index]['id'] ?? null;

            if (is_string($id) && ($counts[$id] ?? 0) === 1) {
                $this->linksById[$id] ??= $span;
            }
        }
    }

    /**
     * @param  array{kind: string, span: StitchSpan, part: string, path: string, item?: mixed, index?: int}  $entry
     * @param  list<string>  $pendingCallIds
     * @param  bool  $newest  whether it is the model's latest request, the only one that can still be waiting to start
     * @return array<string, mixed>
     */
    private function message(array $entry, string $status, array $pendingCallIds, bool $newest): array
    {
        $span = $entry['span'];
        $kind = $entry['kind'];
        $source = ['span_id' => $span->id, 'path' => $entry['path'], 'redacted' => $span->redacted, 'truncated' => $span->truncated];
        $context = ['status' => $status, 'pending' => $pendingCallIds, 'newest' => $newest];

        if ($kind === 'input') {
            $item = $entry['item'] ?? null;
            $item = is_array($item) ? $item : ['content' => $item];
            $stored = self::calls($item) ?? [];
            $links = function (int $index) use ($stored): ?StitchSpan {
                $call = $stored[$index] ?? null;
                $id = is_array($call) ? ($call['id'] ?? null) : null;

                return is_string($id) ? ($this->linksById[$id] ?? null) : null;
            };

            return [
                'part' => $entry['part'],
                'role' => is_string($item['role'] ?? null) ? $item['role'] : null,
                'content' => $item['content'] ?? null,
                'structured' => $item['structured'] ?? null,
                'attachments' => $item['attachments'] ?? null,
                'tool_calls' => $this->shapeCalls($item['tool_calls'] ?? null, $links, $context),
                'tool_results' => $this->shapeResults($item['tool_results'] ?? null),
                'source' => $source,
                'truncated_paths' => self::rebase($span->truncatedPaths, 'input.messages.'.($entry['index'] ?? 0)),
            ];
        }

        if ($kind === 'agent') {
            $input = is_array($span->input) ? $span->input : [];

            return [
                'part' => 'prompt',
                'role' => 'user',
                'content' => $input['prompt'] ?? null,
                'structured' => null,
                'attachments' => $input['attachments'] ?? null,
                'tool_calls' => null,
                'tool_results' => null,
                'source' => $source,
                'truncated_paths' => self::rebase($span->truncatedPaths, 'input', ['prompt' => 'content', 'attachments' => 'attachments']),
            ];
        }

        $output = is_array($span->output) ? $span->output : [];
        $outputLinks = $this->outputLinks[$span->id] ?? [];

        return [
            'part' => $entry['part'],
            'role' => 'assistant',
            'content' => $output['text'] ?? null,
            'structured' => $output['structured'] ?? null,
            'attachments' => null,
            'tool_calls' => $this->shapeCalls($output['tool_calls'] ?? null, fn (int $index): ?StitchSpan => $outputLinks[$index] ?? null, $context),
            'tool_results' => null,
            'source' => $source,
            'truncated_paths' => self::rebase($span->truncatedPaths, 'output', ['text' => 'content', 'tool_calls' => 'tool_calls', 'structured' => 'structured']),
        ];
    }

    /**
     * @param  callable(int): ?StitchSpan  $linked
     * @param  array{status: string, pending: list<string>, newest: bool}  $context
     * @return mixed a list of calls, or the stored value when it is not one
     */
    private function shapeCalls(mixed $stored, callable $linked, array $context): mixed
    {
        if (! is_array($stored) || ! array_is_list($stored)) {
            return $stored;
        }

        $calls = [];

        foreach ($stored as $index => $entry) {
            if (! is_array($entry)) {
                $calls[] = ['id' => null, 'name' => null, 'arguments' => $entry, 'link' => 'unlinked', 'span' => null, 'agent' => null];

                continue;
            }

            $id = $entry['id'] ?? null;
            $tool = $linked($index);

            $link = match (true) {
                $tool !== null => 'linked',
                $context['status'] === 'awaiting_approval' && is_string($id) && in_array($id, $context['pending'], true) => 'awaiting_approval',
                $context['status'] === 'running' && $context['newest'] => 'not_started',
                default => 'unlinked',
            };

            $agent = $tool === null ? null : ($this->agentOf[$tool->id] ?? null);

            $calls[] = [
                'id' => $id,
                'name' => $entry['name'] ?? null,
                'arguments' => $entry['arguments'] ?? null,
                'link' => $link,
                'span' => $tool === null ? null : ['id' => $tool->id, 'status' => $tool->status, 'issue_kind' => $tool->issueKind, 'duration_ms' => $tool->durationMs],
                'agent' => $agent === null ? null : [
                    'span_id' => $agent->id,
                    'name' => $agent->name,
                    'agent_class' => $agent->agentClass,
                    'status' => $agent->status,
                    'issue_kind' => $agent->issueKind,
                    'provider' => $agent->provider,
                    'model' => $agent->model,
                    'duration_ms' => $agent->durationMs,
                    'pending_approvals' => $agent->pendingApprovals,
                    'resolved_tool_call_ids' => $agent->resolvedToolCallIds,
                ],
            ];
        }

        return $calls;
    }

    /**
     * @return mixed a list of results with the span that ran each, or the stored value when it is not a list
     */
    private function shapeResults(mixed $stored): mixed
    {
        if (! is_array($stored) || ! array_is_list($stored)) {
            return $stored;
        }

        return array_map(function (mixed $entry): array {
            $entry = is_array($entry) ? $entry : ['result' => $entry];
            $id = $entry['id'] ?? null;

            return [
                'id' => $id,
                'name' => $entry['name'] ?? null,
                'result' => $entry['result'] ?? null,
                'span_id' => is_string($id) ? ($this->linksById[$id]->id ?? null) : null,
            ];
        }, $stored);
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function attempts(): array
    {
        $children = array_values(array_filter($this->level, fn (StitchSpan $span): bool => $span->type === 'step' || $span->type === 'tool'));
        $numbers = array_values(array_unique([...array_map(fn (StitchSpan $span): int => $span->attempt, $children), $this->attempt]));
        sort($numbers);

        $attempts = [];

        foreach ($numbers as $number) {
            $mine = array_values(array_filter($children, fn (StitchSpan $span): bool => $span->attempt === $number));
            $first = null;
            $failed = null;

            foreach ($mine as $span) {
                $first ??= $span->type === 'step' ? $span : null;
                $failed ??= $span->status === 'failed' ? $span : null;
            }

            $attempts[] = [
                'attempt' => $number,
                'provider' => $first?->provider,
                'model' => $first?->model,
                'span_id' => ($failed ?? $first)?->id,
                'error' => $failed?->error,
            ];
        }

        return $attempts;
    }

    /**
     * The step's messages and the offset they start at, or null when the step stored none.
     *
     * @return array{0: list<mixed>, 1: int}|null
     */
    private static function stored(StitchSpan $step): ?array
    {
        if (! is_array($step->input) || ! is_array($step->input['messages'] ?? null) || ! array_is_list($step->input['messages'])) {
            return null;
        }

        $offset = $step->input['messages_offset'] ?? null;

        return [$step->input['messages'], is_int($offset) && $offset >= 0 ? $offset : 0];
    }

    /**
     * @return list<mixed>|null the list of calls under `tool_calls`, or null when there is none
     */
    private static function calls(mixed $holder): ?array
    {
        $calls = is_array($holder) ? ($holder['tool_calls'] ?? null) : null;

        return is_array($calls) && array_is_list($calls) ? $calls : null;
    }

    private static function role(mixed $message): ?string
    {
        return is_array($message) && is_string($message['role'] ?? null) ? $message['role'] : null;
    }

    /**
     * @param  list<mixed>  $messages
     */
    private static function lastRole(array $messages, string $role): ?int
    {
        for ($index = count($messages) - 1; $index >= 0; $index--) {
            if (self::role($messages[$index]) === $role) {
                return $index;
            }
        }

        return null;
    }

    private static function prompted(StitchSpan $root): bool
    {
        return is_array($root->input) && is_string($root->input['prompt'] ?? null) && $root->input['prompt'] !== '';
    }

    /**
     * The cut paths under a place, named relative to it. A path matches whole segments only.
     *
     * @param  array<string, int>  $paths
     * @param  array<string, string>|null  $names  the first segment below the place and what a message calls it; null keeps every path
     * @return array<string, int>
     */
    private static function rebase(array $paths, string $place, ?array $names = null): array
    {
        $rebased = [];

        foreach ($paths as $path => $length) {
            $path = (string) $path;

            if (! str_starts_with($path, $place.'.')) {
                continue;
            }

            $rest = substr($path, strlen($place) + 1);
            $head = explode('.', $rest, 2)[0];

            if ($names === null) {
                $rebased[$rest] = $length;
            } elseif (isset($names[$head])) {
                $rebased[$names[$head].substr($rest, strlen($head))] = $length;
            }
        }

        return $rebased;
    }
}
