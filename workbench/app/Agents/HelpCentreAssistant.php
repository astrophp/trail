<?php

namespace Workbench\App\Agents;

use Laravel\Ai\Contracts\Agent;
use Laravel\Ai\Contracts\HasTools;
use Laravel\Ai\Promptable;
use Stringable;
use Workbench\App\Tools\SearchHelpArticles;

/**
 * Points customers at the help article that answers their question.
 */
class HelpCentreAssistant implements Agent, HasTools
{
    use Promptable;

    public function instructions(): Stringable|string
    {
        return 'You answer questions from the Northwind Outfitters help centre. '
            .'Search the articles first and name the one that applies.';
    }

    public function tools(): iterable
    {
        return [new SearchHelpArticles];
    }
}
