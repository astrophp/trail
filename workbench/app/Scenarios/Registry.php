<?php

namespace Workbench\App\Scenarios;

use InvalidArgumentException;
use Workbench\App\Scenarios\Catalog\AbandonedStream;
use Workbench\App\Scenarios\Catalog\ApprovalGatedTool;
use Workbench\App\Scenarios\Catalog\Conversation;
use Workbench\App\Scenarios\Catalog\Delegation;
use Workbench\App\Scenarios\Catalog\EmbeddingsInTool;
use Workbench\App\Scenarios\Catalog\FailingSubAgent;
use Workbench\App\Scenarios\Catalog\Failover;
use Workbench\App\Scenarios\Catalog\PartlyPricedRun;
use Workbench\App\Scenarios\Catalog\PlainAnswer;
use Workbench\App\Scenarios\Catalog\ProviderFailure;
use Workbench\App\Scenarios\Catalog\SeveralSteps;
use Workbench\App\Scenarios\Catalog\StreamedRun;
use Workbench\App\Scenarios\Catalog\StructuredOutput;
use Workbench\App\Scenarios\Catalog\ThrowingTool;
use Workbench\App\Scenarios\Catalog\ToolCalls;
use Workbench\App\Scenarios\Catalog\UnpricedRun;

/**
 * Every scenario the workbench can run, by key.
 */
final class Registry
{
    /** @var list<class-string<Scenario>> */
    private const SCENARIOS = [
        PlainAnswer::class,
        ToolCalls::class,
        SeveralSteps::class,
        Delegation::class,
        FailingSubAgent::class,
        ThrowingTool::class,
        ProviderFailure::class,
        Failover::class,
        StreamedRun::class,
        StructuredOutput::class,
        ApprovalGatedTool::class,
        Conversation::class,
        EmbeddingsInTool::class,
        PartlyPricedRun::class,
        UnpricedRun::class,
        AbandonedStream::class,
    ];

    /**
     * @return array<string, Scenario> keyed by scenario key
     */
    public function all(): array
    {
        $scenarios = [];

        foreach (self::SCENARIOS as $class) {
            $scenario = new $class;
            $scenarios[$scenario->key()] = $scenario;
        }

        return $scenarios;
    }

    public function has(string $key): bool
    {
        return array_key_exists($key, $this->all());
    }

    public function get(string $key): Scenario
    {
        return $this->all()[$key] ?? throw new InvalidArgumentException("Unknown scenario [{$key}].");
    }
}
