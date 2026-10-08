<?php

namespace Astro\Trail\Transcript;

use Astro\Trail\Capture\CaptureState;

/**
 * One span of a turn as the stitching reads it: what the span stored, with its status already the
 * one the API shows. Kept apart from the model so the stitching needs neither a database nor an
 * application.
 */
final readonly class StitchSpan
{
    /** What capture writes in place of a redacted value. */
    private const REDACTED = '[redacted]';

    /**
     * @param  string  $type  agent, step, tool or embedding
     * @param  array<string, mixed>|null  $error  the span's error, in the API's shape
     * @param  array<string, int>  $truncatedPaths  the cut payload paths and their original lengths
     * @param  list<array<string, mixed>>  $pendingApprovals  an agent span's pending approvals, sanitised
     * @param  list<string>  $resolvedToolCallIds  an agent span's resolved call ids, sanitised
     */
    public function __construct(
        public string $id,
        public ?string $parentId,
        public string $type,
        public string $name,
        public ?string $agentClass,
        public int $attempt,
        public int $sequence,
        public string $status,
        public ?string $issueKind,
        public ?float $durationMs,
        public ?string $provider,
        public ?string $model,
        public ?array $error,
        public mixed $input,
        public mixed $output,
        public bool $redacted = false,
        public bool $truncated = false,
        public array $truncatedPaths = [],
        public array $pendingApprovals = [],
        public array $resolvedToolCallIds = [],
    ) {}

    /**
     * Whether the span lost something it cannot say where. Capture sets the flag for a value it
     * dropped (too deep, too wide, a key too long) without a path, and it keeps the first paths only,
     * so a list that is empty or full does not show where everything was cut.
     */
    public function cutSomewhereUnknown(): bool
    {
        return $this->truncated && ($this->truncatedPaths === [] || count($this->truncatedPaths) >= CaptureState::MAX_PATHS);
    }

    /**
     * Whether a tool span's arguments can be compared with a call's. Redaction replaces a value with
     * a marker, which makes different arguments look equal, and a cut that says nowhere where it was
     * could have reached them.
     */
    public function hasTrustworthyArguments(): bool
    {
        $arguments = is_array($this->input) ? ($this->input['arguments'] ?? null) : null;

        return ! $this->wasRedacted($arguments) && ! $this->cutAt(exact: ['input'], beneath: ['input.arguments']);
    }

    /**
     * Whether the arguments of one call in a list of tool calls stored on this span can be
     * compared: `output.tool_calls` for a step's output, `input.messages.2.tool_calls` for a
     * stored message.
     */
    public function hasTrustworthyCall(string $listPath, int $index, mixed $call): bool
    {
        $arguments = is_array($call) ? ($call['arguments'] ?? null) : null;

        return ! $this->wasRedacted($arguments) && ! $this->cutAt(exact: [$listPath], beneath: [$listPath.'.'.$index]);
    }

    /**
     * Whether the span was redacted and the value holds the marker redaction leaves.
     */
    private function wasRedacted(mixed $value): bool
    {
        return $this->redacted && str_contains((string) json_encode($value), self::REDACTED);
    }

    /**
     * Whether the span was cut at one of the exact paths or beneath one of the others, or was cut
     * somewhere it does not say. A path matches whole segments only, so `output.tool_calls.1` is not `output.tool_calls.10`.
     *
     * @param  list<string>  $exact
     * @param  list<string>  $beneath
     */
    private function cutAt(array $exact, array $beneath): bool
    {
        if (! $this->truncated) {
            return false;
        }

        if ($this->cutSomewhereUnknown()) {
            return true;
        }

        foreach (array_keys($this->truncatedPaths) as $cut) {
            $cut = (string) $cut;

            if (in_array($cut, $exact, true)) {
                return true;
            }

            foreach ($beneath as $path) {
                if ($cut === $path || str_starts_with($cut, $path.'.')) {
                    return true;
                }
            }
        }

        return false;
    }
}
