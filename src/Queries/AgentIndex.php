<?php

namespace Astro\Trail\Queries;

use Astro\Trail\Enums\SpanType;
use Astro\Trail\Enums\Status;
use Astro\Trail\Storage\Models\Span;
use Astro\Trail\Storage\Models\Trace;
use Astro\Trail\Storage\StaleRuns;
use Carbon\CarbonImmutable;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Carbon;
use Illuminate\Validation\ValidationException;

/**
 * The agents of a range, discovered from the runs and never created: a name under which a run
 * started (its own, "top level" runs) or under which an agent span with a parent started inside a
 * run that did (a delegated run).
 *
 * Four reads, whatever the page:
 *  1. the top-level groups: the runs of the range grouped by name;
 *  2. the delegated groups: the agent spans with a parent, in runs of the range, matched to those
 *     groups by a slot worked out in the database, so that the database's own comparison decides
 *     which names are one agent, and the names of agents with no run of their own come back apart;
 *  3. the latest spelling, class and type of the agents of the page;
 *  4. the runs of the agents of the page in each bucket of the range.
 *
 * Merging, sorting and paging are done over the grouped rows, at most `limit` groups of each of
 * reads 1 and 2 (those with most runs, or most delegated spans).
 */
final class AgentIndex
{
    /** The most groups each of the two grouped reads returns. */
    public const LIMIT = 1000;

    public function __construct(private readonly int $limit = self::LIMIT) {}

    /**
     * @throws ValidationException when an explicit range is too long to be cut into buckets
     */
    public function list(TimeRange $range, AgentFilters $filters, Page $page): AgentListing
    {
        $unit = BucketUnit::for($range);
        $cuts = $unit->buckets($range);

        ['groups' => $groups, 'truncated' => $truncated] = $this->groups($range, $filters->search, null);

        usort($groups, fn (AgentGroup $a, AgentGroup $b) => self::compare($a, $b, $filters));
        $pageGroups = array_slice($groups, $page->offset(), $page->perPage);

        $now = Carbon::now();
        $buckets = array_map(fn (array $cut) => [
            'from' => $cut['from'],
            'to' => $cut['to'],
            'full' => $cut['full'],
            // By the clock: now is inside the bucket's span before the range cut it.
            'inProgress' => $cut['start'] <= $now && $now < $cut['end'],
        ], $cuts);

        return new AgentListing($this->agents($range, $pageGroups, $cuts), count($groups), $truncated, $this->limit, $unit, $buckets);
    }

    /**
     * The agent of that name in the range, or null when it has no run and no delegated span there.
     * The name is compared as the database compares text.
     *
     * @throws ValidationException when an explicit range is too long to be cut into buckets
     */
    public function find(TimeRange $range, string $name): ?Agent
    {
        $cuts = BucketUnit::for($range)->buckets($range);
        $groups = $this->groups($range, null, $name)['groups'];

        return $groups === [] ? null : $this->agents($range, [$groups[0]], $cuts)[0];
    }

    /**
     * Reads 1 and 2.
     *
     * @return array{groups: list<AgentGroup>, truncated: bool}
     */
    private function groups(TimeRange $range, ?string $search, ?string $name): array
    {
        $rows = $this->topLevel($range, $search, $name);
        $truncated = count($rows) > $this->limit;

        $groups = [];
        $names = [];

        foreach (array_slice($rows, 0, $this->limit) as $row) {
            $names[] = Row::string($row, 'name');
            $groups[] = new AgentGroup(Row::string($row, 'name'), RunFigures::fromRow($row), StoredMoment::parse($row->latest ?? null), null);
        }

        $delegated = $this->delegated($range, $search, $name, $names);
        $truncated = $truncated || count($delegated) > $this->limit;

        foreach (array_slice($delegated, 0, $this->limit) as $row) {
            $slot = Row::nullableInt($row, 'slot') ?? -1;
            $delegations = new Delegations(Row::int($row, 'delegated'), Row::int($row, 'failed'), Row::int($row, 'incomplete'), StoredMoment::parse($row->latest ?? null));

            if (isset($groups[$slot])) {
                $groups[$slot] = $groups[$slot]->withDelegations($delegations);
            } else {
                $groups[] = new AgentGroup(Row::string($row, 'name'), null, null, $delegations);
            }
        }

        return ['groups' => $groups, 'truncated' => $truncated];
    }

    /**
     * Read 1: the runs of the range grouped by name, the most runs first.
     *
     * @return list<object>
     */
    private function topLevel(TimeRange $range, ?string $search, ?string $name): array
    {
        $query = Trace::query()->toBase()->select('name');
        RunFigures::select($query);
        $query->selectRaw('max(started_at) as latest');

        $range->apply($query, 'started_at');

        if ($name !== null) {
            $query->where('name', $name);
        }

        self::matching($query, $search);

        return array_values($query->groupBy('name')->orderByRaw('count(*) desc')->orderBy('name')->limit($this->limit + 1)->get()->all());
    }

    /**
     * Read 2: the agent spans with a parent, in the runs of the range, grouped by the slot of the
     * top-level group they match (or -1) and by name.
     *
     * @param  list<string>  $names  the top-level groups read, by slot
     * @return list<object>
     */
    private function delegated(TimeRange $range, ?string $search, ?string $name, array $names): array
    {
        [$slot, $bindings] = self::slots($names);
        $cutoff = StaleRuns::cutoffColumn();

        $query = self::delegatedSpans($range)
            ->selectRaw($slot.' as slot', $bindings)
            ->addSelect('name')
            ->selectRaw('count(*) as delegated')
            ->selectRaw('sum(case when status = ? then 1 else 0 end) as failed', [Status::Failed->value])
            ->selectRaw('sum(case when status = ? or (status = ? and created_at < ?) then 1 else 0 end) as incomplete', [Status::Incomplete->value, Status::Running->value, $cutoff])
            ->selectRaw('max(started_at) as latest');

        if ($name !== null) {
            $query->where('name', $name);
        }

        self::matching($query, $search);

        return array_values($query->groupBy('slot', 'name')->orderByRaw('count(*) desc')->orderBy('name')->limit($this->limit + 1)->get()->all());
    }

    /**
     * The agent spans that have a parent, in runs that started in the range. A span never starts
     * before its run, so the range's start bounds them too, which the index on the span's type and
     * name can serve.
     */
    private static function delegatedSpans(TimeRange $range): Builder
    {
        $runs = Trace::query()->toBase()->select('id');
        $range->apply($runs, 'started_at');

        return Span::query()->toBase()
            ->where('type', SpanType::Agent->value)
            ->whereNotNull('parent_id')
            ->where('started_at', '>=', StaleRuns::format($range->from))
            ->whereIn('trace_id', $runs);
    }

    /**
     * Keep the rows with a name that contains the text, whatever its case. The database compares
     * text as it does for the group, so the spellings it takes for one agent all match or none does.
     */
    private static function matching(Builder $query, ?string $search): void
    {
        if ($search !== null) {
            $query->whereRaw("lower(name) like ? escape '!'", [Contains::pattern($search)]);
        }
    }

    /**
     * The slot of a name: its place in the list, worked out by the database's own comparison, or
     * -1 for a name that is not in it.
     *
     * @param  list<string>  $names
     * @return array{0: literal-string, 1: list<string|int>}
     */
    private static function slots(array $names): array
    {
        $whens = [];
        $bindings = [];

        foreach ($names as $slot => $name) {
            $whens[] = 'when name = ? then ?';
            array_push($bindings, $name, $slot);
        }

        return $whens === [] ? ['-1', []] : ['case '.implode(' ', $whens).' else -1 end', $bindings];
    }

    /**
     * Reads 3 and 4 for the groups of a page, and the agents they make.
     *
     * @param  list<AgentGroup>  $groups
     * @param  list<array{start: CarbonImmutable, end: CarbonImmutable, from: CarbonImmutable, to: CarbonImmutable, full: bool}>  $cuts
     * @return list<Agent>
     */
    private function agents(TimeRange $range, array $groups, array $cuts): array
    {
        $own = [];
        $delegatedOnly = [];

        foreach ($groups as $index => $group) {
            $group->figures === null ? $delegatedOnly[$index] = $group->name : $own[$index] = $group->name;
        }

        $identities = $this->identities($range, array_values($own), array_values($delegatedOnly));
        $activity = $this->activity($range, array_values($own), $cuts);

        $agents = [];
        $ownSlot = array_flip(array_keys($own));
        $delegatedSlot = array_flip(array_keys($delegatedOnly));

        foreach ($groups as $index => $group) {
            $identity = $group->figures === null
                ? ($identities['span'][$delegatedSlot[$index]] ?? null)
                : ($identities['run'][$ownSlot[$index]] ?? null);

            $identity ??= new AgentIdentity($group->name, null, SpanType::Agent);

            $agents[] = new Agent(
                $identity->name,
                $identity->agentClass,
                $identity->type,
                $group->figures,
                $group->lastRunAt,
                $group->delegated,
                $group->figures === null ? array_fill(0, count($cuts), 0) : array_values($activity[$ownSlot[$index]] ?? array_fill(0, count($cuts), 0)),
            );
        }

        return $agents;
    }

    /**
     * Read 3: the latest run of each agent that has runs, and the latest delegated span of each
     * that has none (greatest start, then greatest id), in one statement.
     *
     * @param  list<string>  $own
     * @param  list<string>  $delegatedOnly
     * @return array{run: array<int, AgentIdentity>, span: array<int, AgentIdentity>}
     */
    private function identities(TimeRange $range, array $own, array $delegatedOnly): array
    {
        [$slot, $bindings] = self::slots($own);
        $runs = Trace::query()->toBase()->selectRaw($slot.' as slot', $bindings)
            ->addSelect('name', 'agent_class', 'type', 'id', 'started_at')
            ->whereIn('name', $own);
        $range->apply($runs, 'started_at');

        [$slot, $bindings] = self::slots($delegatedOnly);
        $spans = self::delegatedSpans($range)->selectRaw($slot.' as slot', $bindings)
            ->addSelect('name', 'agent_class', 'id', 'started_at')
            ->whereIn('name', $delegatedOnly);

        $window = 'row_number() over (partition by slot order by started_at desc, id desc) as place';

        $latestRun = $runs->newQuery()->fromSub($runs->newQuery()->fromSub($runs, 't')->select('slot', 'name', 'agent_class', 'type')->selectRaw($window), 'r')
            ->selectRaw("'run' as source")->addSelect('slot', 'name', 'agent_class', 'type')->where('place', 1);

        $latestSpan = $spans->newQuery()->fromSub($spans->newQuery()->fromSub($spans, 't')->select('slot', 'name', 'agent_class')->selectRaw($window), 'r')
            ->selectRaw("'span' as source")->addSelect('slot', 'name', 'agent_class')->selectRaw("'agent' as type")->where('place', 1);

        $found = ['run' => [], 'span' => []];

        foreach ($latestRun->unionAll($latestSpan)->get() as $row) {
            $slot = Row::nullableInt($row, 'slot');
            $source = Row::string($row, 'source');

            if ($slot !== null && ($source === 'run' || $source === 'span')) {
                $found[$source][$slot] = new AgentIdentity(
                    Row::string($row, 'name'),
                    Row::nullableString($row, 'agent_class'),
                    SpanType::tryFrom(Row::string($row, 'type')) ?? SpanType::Agent,
                );
            }
        }

        return $found;
    }

    /**
     * Read 4: the runs of each given agent in each bucket of the range.
     *
     * @param  list<string>  $own
     * @param  list<array{start: CarbonImmutable, end: CarbonImmutable, from: CarbonImmutable, to: CarbonImmutable, full: bool}>  $cuts
     * @return array<int, array<int, int>> by slot, then by bucket
     */
    private function activity(TimeRange $range, array $own, array $cuts): array
    {
        [$agentSlot, $agentBindings] = self::slots($own);

        // A run belongs to the first bucket whose end is after its start. The last bucket needs no test.
        $whens = [];
        $bucketBindings = [];

        foreach (array_slice($cuts, 0, -1) as $bucket => $cut) {
            $whens[] = 'when started_at < ? then ?';
            array_push($bucketBindings, StaleRuns::format($cut['to']), $bucket);
        }

        $bucketBindings[] = count($cuts) - 1;

        $query = Trace::query()->toBase()
            ->selectRaw($agentSlot.' as agent_slot', $agentBindings)
            ->selectRaw('case '.implode(' ', $whens).' else ? end as bucket_slot', $bucketBindings)
            ->selectRaw('count(*) as runs')
            ->whereIn('name', $own);
        $range->apply($query, 'started_at');

        $activity = [];

        foreach ($own as $slot => $unused) {
            $activity[$slot] = array_fill(0, count($cuts), 0);
        }

        foreach ($query->groupBy('agent_slot', 'bucket_slot')->get() as $row) {
            $agent = Row::int($row, 'agent_slot');
            $bucket = Row::int($row, 'bucket_slot');

            if (isset($activity[$agent][$bucket])) {
                $activity[$agent][$bucket] = Row::int($row, 'runs');
            }
        }

        return $activity;
    }

    /**
     * Groups without the sorted value come last whichever the direction; equal values are ordered
     * by name in the direction of the sort, so that a page never repeats or skips an agent.
     */
    private static function compare(AgentGroup $a, AgentGroup $b, AgentFilters $filters): int
    {
        $direction = $filters->descending ? -1 : 1;
        $one = $a->sortValue($filters->sort);
        $other = $b->sortValue($filters->sort);

        if (($one === null) !== ($other === null)) {
            return $one === null ? 1 : -1;
        }

        $order = $one === null || $other === null ? 0 : (is_string($one) ? self::text($one, $other) : $one <=> $other);

        return $direction * ($order !== 0 ? $order : self::text($a->name, $b->name));
    }

    private static function text(string|int|float $a, string|int|float $b): int
    {
        return strcmp(mb_strtolower((string) $a), mb_strtolower((string) $b)) ?: strcmp((string) $a, (string) $b);
    }
}
