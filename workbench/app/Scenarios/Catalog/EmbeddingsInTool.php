<?php

namespace Workbench\App\Scenarios\Catalog;

use Astro\Trail\Tests\Fixtures\Sdk\FakeAnthropic;
use Workbench\App\Agents\HelpCentreAssistant;
use Workbench\App\Scenarios\Backend;
use Workbench\App\Scenarios\Scenario;

class EmbeddingsInTool extends Scenario
{
    protected string $title = 'Embeddings inside a tool';

    protected string $description = 'A help-centre search tool embeds the question and the article titles to find the best match.';

    public function supportsLive(): bool
    {
        return false;
    }

    public function run(Backend $backend): void
    {
        $backend->script([
            FakeAnthropic::toolUse(
                [['id' => 'toolu_01search', 'name' => 'search_help_articles', 'input' => ['question' => 'Can I send back a jacket I wore once?']]],
                ['input_tokens' => 447, 'output_tokens' => 45],
            ),
            FakeAnthropic::text(
                'The article "How returns and exchanges work" covers returning worn items.',
                ['input_tokens' => 566, 'output_tokens' => 52],
            ),
        ]);

        (new HelpCentreAssistant)->prompt('Can I send back a jacket I wore once?');
    }
}
