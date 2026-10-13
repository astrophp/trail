<?php

namespace Astro\Trail\Capture;

use Laravel\Ai\Classification\Boolean;
use Laravel\Ai\Classification\Choice;
use Laravel\Ai\Classification\Score;
use Laravel\Ai\Prompts\ClassificationPrompt;
use Laravel\Ai\Prompts\RerankingPrompt;
use Laravel\Ai\Responses\ClassificationResponse;
use Laravel\Ai\Responses\Data\BooleanAnswer;
use Laravel\Ai\Responses\Data\ChoiceAnswer;
use Laravel\Ai\Responses\Data\RankedDocument;
use Laravel\Ai\Responses\Data\ScoreAnswer;
use Laravel\Ai\Responses\RerankingResponse;

/** One bounded context shared by a capability's input and output. SDK objects are never dumped. */
final class CapabilityPayload
{
    private int $nodes = 950;

    // Leave room for the enclosing JSON object's keys and punctuation.
    private int $bytes = 65_500;

    private int $omitted = 0;

    private bool $redacted = false;

    /** @var array<string, int> */
    private array $truncated = [];

    public function __construct(private readonly Payload $payload, private readonly int $maxItems) {}

    public function input(ClassificationPrompt|RerankingPrompt $prompt): Captured
    {
        if ($prompt instanceof ClassificationPrompt) {
            $attachments = property_exists($prompt, 'attachments') && is_array($prompt->attachments) ? $prompt->attachments : null;
            $counts = ['question_count' => count($prompt->questions), 'attachment_count' => $attachments === null ? null : count($attachments)];
            if (! $this->payload->capturing()) {
                return new Captured($counts);
            }
            $questions = [];
            foreach ($prompt->questions as $key => $question) {
                if (count($questions) >= $this->maxItems || $this->nodes <= 0) {
                    $this->omitted += count($prompt->questions) - count($questions);
                    break;
                }
                $questions[$key] = $this->value(match (true) {
                    $question instanceof Boolean => ['type' => 'boolean', 'instructions' => $question->instructions, 'criteria' => $question->criteria],
                    $question instanceof Choice => ['type' => 'choice', 'instructions' => $question->instructions, 'options' => $question->options],
                    $question instanceof Score => ['type' => 'score', 'instructions' => $question->instructions, 'levels' => $question->levels],
                    default => ['type' => 'unsupported'],
                }, limitItems: false);
            }
            $body = $counts + ['questions' => $questions, 'state' => $this->value($prompt->state)];
            if ($attachments !== null) {
                $body['attachments'] = $this->value($this->payload->attachments(array_slice($attachments, 0, $this->maxItems)));
                $this->omitted += max(0, count($attachments) - $this->maxItems);
            }
        } else {
            $counts = ['document_count' => count($prompt->documents), 'limit' => $prompt->limit];
            if (! $this->payload->capturing()) {
                return new Captured($counts);
            }
            $documents = [];
            foreach ($prompt->documents as $index => $document) {
                if (count($documents) >= $this->maxItems || $this->nodes < 5) {
                    $this->omitted += count($prompt->documents) - count($documents);
                    break;
                }
                $snippet = $this->snippet($document, 'input.documents.'.count($documents).'.snippet');
                if ($snippet->dropped) {
                    $this->omitted++;
                }
                $this->redacted = $this->redacted || $snippet->redacted;
                $this->truncated += $snippet->truncated;
                $documents[] = ['index' => $index, 'snippet' => $snippet->value, 'truncated' => $snippet->dropped || $snippet->truncated !== [], 'redacted' => $snippet->redacted];
                $this->nodes -= 5;
            }
            $body = $counts + ['query' => $this->value($prompt->query), 'documents' => $documents];
        }

        return $this->capture($body, 'input', min(32_750, $this->bytes));
    }

    public function output(ClassificationResponse|RerankingResponse $response): Captured
    {
        $classification = $response instanceof ClassificationResponse;
        $items = $classification ? $response->answers : $response->results;
        $counts = [$classification ? 'answer_count' : 'result_count' => count($items)];
        if (! $this->payload->capturing()) {
            return new Captured($counts);
        }
        $captured = [];
        foreach ($items as $key => $item) {
            if (count($captured) >= $this->maxItems || $this->nodes <= 0) {
                $this->omitted += count($items) - count($captured);
                break;
            }
            if ($classification) {
                $captured[$key] = $this->value(match (true) {
                    $item instanceof BooleanAnswer => ['type' => 'boolean', 'probability' => $item->probability],
                    $item instanceof ChoiceAnswer => ['type' => 'choice', 'choice' => $item->choice, 'probabilities' => $item->probabilities, 'confidence' => $item->confidence],
                    $item instanceof ScoreAnswer => ['type' => 'score', 'score' => $item->score, 'probabilities' => $item->probabilities, 'legend' => $item->legend, 'confidence' => $item->confidence],
                    default => ['type' => 'unsupported'],
                }, limitItems: false);
            } elseif ($item instanceof RankedDocument) {
                // Index and score only: never duplicate the input document text.
                $captured[] = $this->value(['index' => $item->index, 'score' => $item->score], limitItems: false);
            }
        }

        return $this->capture($counts + [$classification ? 'answers' : 'results' => $captured], 'output', $this->bytes);
    }

    private function snippet(mixed $value, string $path): Captured
    {
        // SDK docblocks promise strings, but the prompt's array has no runtime element validation.
        return is_string($value) ? $this->payload->bounded(1000)->capture($value, $path) : new Captured(null, dropped: true);
    }

    private function value(mixed $value, int $depth = 0, bool $limitItems = true): mixed
    {
        if ($this->nodes-- <= 0 || $depth >= 24) {
            $this->omitted++;

            return null;
        }
        if (! is_array($value)) {
            return is_scalar($value) || $value === null ? $value : null;
        }
        $bounded = [];
        foreach ($value as $key => $item) {
            if (($limitItems && count($bounded) >= $this->maxItems) || $this->nodes <= 0) {
                $this->omitted += count($value) - count($bounded);
                break;
            }
            $bounded[$key] = $this->value($item, $depth + 1);
        }

        return $bounded;
    }

    /** @param array<string, mixed> $body */
    private function capture(array $body, string $path, int $bytes): Captured
    {
        $body['omitted_entries'] = $this->omitted;
        $clean = $this->payload->bounded(10_000)->capture($body, $path);
        $value = is_array($clean->value) ? $clean->value : [];
        $dropped = $this->omitted > 0;
        // Drop trailing entries, never cut serialized JSON or bypass redaction.
        while (strlen(json_encode($value, JSON_THROW_ON_ERROR)) > $bytes) {
            $removed = false;
            foreach (['attachments', 'state', 'questions', 'query', 'documents', 'answers', 'results'] as $field) {
                if (is_array($value[$field] ?? null) && $value[$field] !== []) {
                    array_pop($value[$field]);
                    $removed = true;
                    break;
                }
                if (is_string($value[$field] ?? null)) {
                    $value[$field] = null;
                    $removed = true;
                    break;
                }
            }
            if (! $removed) {
                break;
            }
            $dropped = true;
            $value['omitted_entries'] = ++$this->omitted;
        }
        $this->bytes -= strlen(json_encode($value, JSON_THROW_ON_ERROR));

        return new Captured($value, $clean->redacted || $this->redacted, $clean->truncated + $this->truncated, $clean->dropped || $dropped);
    }
}
