<?php

use Astro\Trail\Tests\Fixtures\Agents\AssistantAgent;
use Astro\Trail\Tests\Fixtures\Agents\RememberingAgent;
use Astro\Trail\Tests\Fixtures\Agents\ResearcherAgent;
use Astro\Trail\Tests\Fixtures\Capture\Failures;
use Astro\Trail\Tests\Fixtures\Conversations\ConversationParticipant;
use Astro\Trail\Tests\Fixtures\Sdk\FakeAnthropic;
use Astro\Trail\Tests\Fixtures\Sdk\Sdk;
use Astro\Trail\Tests\Fixtures\Tools\CallbackTool;
use Illuminate\Http\Client\RequestException;
use Laravel\Ai\Events\AgentFailed;
use Laravel\Ai\Events\PromptingAgent;
use Laravel\Ai\Events\ToolFailed;
use Laravel\Ai\Events\ToolInvoked;
use Laravel\Ai\Responses\Data\ToolCall;

/*
|--------------------------------------------------------------------------
| The SDK behaviour flags against the installed SDK
|--------------------------------------------------------------------------
|
| Each flag in Sdk is read from the version Composer installed. These tests
| make the SDK do the thing each flag describes and check that the flag agrees
| with what the SDK did, so a flag set against the wrong release fails here
| rather than as a confusing failure somewhere else.
|
*/

function sdkFlagDisagrees(string $flag, string $observed): string
{
    return "Sdk::{$flag}() disagrees with the SDK's behaviour: laravel/ai ".Sdk::version()." {$observed}.";
}

it('says whether a tool that throws ends the run', function () {
    FakeAnthropic::script([
        FakeAnthropic::toolUse([['id' => 'toolu_1', 'name' => 'explode', 'input' => []]]),
        FakeAnthropic::text('ok'),
    ]);

    Failures::outcome(fn () => (new AssistantAgent([new CallbackTool('explode', fn () => throw new RuntimeException('Tool broke'))]))->prompt('Hi'));

    $timeline = $this->sdk->timeline();
    $carriedOn = array_slice($timeline, array_search('ToolFailed(explode)', $timeline, true) + 1, 1) === ['StartingStep#1'];

    expect($carriedOn)->toBe(Sdk::recoversFromToolFailures(), sdkFlagDisagrees('recoversFromToolFailures', $carriedOn
        ? 'ran another step after the tool failed'
        : 'ended the run when the tool failed'))
        ->and($this->sdk->of(AgentFailed::class))->toHaveCount($carriedOn ? 0 : 1);
});

it('says whether a sub-agent that throws fails its agent tool', function () {
    AssistantAgent::fake([new ToolCall('call_1', 'ResearcherAgent', ['task' => 'Dig']), 'Done']);
    ResearcherAgent::fake([fn () => throw new RuntimeException('boom')]);

    (new AssistantAgent([new ResearcherAgent]))->prompt('Hi');

    $failed = count($this->sdk->of(ToolFailed::class)) === 1 && $this->sdk->of(ToolInvoked::class) === [];

    expect($failed)->toBe(Sdk::failsAgentToolWithSubAgent(), sdkFlagDisagrees('failsAgentToolWithSubAgent', $failed
        ? 'failed the agent tool'
        : 'returned the failure as the agent tool\'s result'));
});

it('says whether the title of a new conversation is an agent run of its own', function () {
    $this->migrateSdkTables();
    config(['ai.conversations.generate_title' => true]);
    FakeAnthropic::script([FakeAnthropic::text('Hello'), FakeAnthropic::text('A Short Title')]);

    (new RememberingAgent)->forUser(new ConversationParticipant)->prompt('Hi');

    $runs = count($this->sdk->of(PromptingAgent::class));

    expect($runs === 2)->toBe(Sdk::reportsTitleCallAsAgentRun(), sdkFlagDisagrees('reportsTitleCallAsAgentRun', "fired PromptingAgent {$runs} times"));
});

it('says whether a 401 raises InvalidApiKeyException', function () {
    FakeAnthropic::script([FakeAnthropic::error(401, 'Invalid key')]);

    $thrown = Failures::thrown(fn () => (new AssistantAgent)->prompt('Hi'));

    expect($thrown)->toBeInstanceOf(RequestException::class)
        ->and($thrown::class === 'Laravel\\Ai\\Exceptions\\InvalidApiKeyException')
        ->toBe(Sdk::raisesInvalidApiKey(), sdkFlagDisagrees('raisesInvalidApiKey', 'raised '.$thrown::class.' for a 401'));
});
