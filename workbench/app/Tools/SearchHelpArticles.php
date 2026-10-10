<?php

namespace Workbench\App\Tools;

use Illuminate\Contracts\JsonSchema\JsonSchema;
use Laravel\Ai\Contracts\Tool;
use Laravel\Ai\Embeddings;
use Laravel\Ai\Tools\Request;
use Stringable;

/**
 * Finds the help article closest to a question by comparing embeddings of the question and of
 * each article title.
 */
class SearchHelpArticles implements Tool
{
    private const ARTICLES = [
        'How returns and exchanges work',
        'Shipping times and carriers',
        'Caring for waterproof gear',
        'Warranty on trekking equipment',
    ];

    public function name(): string
    {
        return 'search_help_articles';
    }

    public function description(): Stringable|string
    {
        return 'Search the help centre and return the title of the article that best matches a question.';
    }

    public function handle(Request $request): Stringable|string
    {
        $vectors = Embeddings::for([(string) $request['question'], ...self::ARTICLES])->generate()->embeddings;
        $question = array_shift($vectors);

        $scores = array_map(fn (array $vector): float => $this->similarity($question, $vector), $vectors);
        arsort($scores);

        return 'Best match: '.self::ARTICLES[array_key_first($scores)];
    }

    public function schema(JsonSchema $schema): array
    {
        return [
            'question' => $schema->string()->description('What the customer asked.')->required(),
        ];
    }

    /**
     * @param  array<int, float>  $a
     * @param  array<int, float>  $b
     */
    private function similarity(array $a, array $b): float
    {
        $dot = 0.0;
        $normA = 0.0;
        $normB = 0.0;

        foreach ($a as $position => $value) {
            $dot += $value * ($b[$position] ?? 0.0);
            $normA += $value ** 2;
            $normB += ($b[$position] ?? 0.0) ** 2;
        }

        return $normA > 0 && $normB > 0 ? $dot / (sqrt($normA) * sqrt($normB)) : 0.0;
    }
}
