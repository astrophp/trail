<?php

use Astro\Trail\Capture\Sampler;
use Astro\Trail\Enums\SpanType;
use Astro\Trail\RecordingCandidate;
use Illuminate\Cache\ArrayStore;
use Illuminate\Cache\Repository as CacheRepository;
use Illuminate\Config\Repository;
use Illuminate\Contracts\Cache\Factory;
use Illuminate\Contracts\Cache\Repository as CacheContract;

/**
 * A sampler over an array cache, with the draws and the clock a test dictates.
 *
 * @param  list<float>  $draws
 * @return array{Sampler, CacheContract, stdClass}
 */
function samplerWith(mixed $rate = 1.0, array $draws = [0.0]): array
{
    $cache = new CacheRepository(new ArrayStore);
    $state = new stdClass;
    $state->draws = 0;
    $state->now = 0;
    $state->reads = 0;

    $factory = new class($cache, $state) implements Factory
    {
        public function __construct(private CacheContract $cache, private stdClass $state) {}

        public function store($name = null): CacheContract
        {
            $this->state->reads++;

            return $this->cache;
        }
    };

    $sampler = new Sampler(
        new Repository(['trail' => ['sampling' => $rate]]),
        $factory,
        function () use (&$draws, $state): float {
            $state->draws++;

            return array_shift($draws) ?? 0.0;
        },
        fn (): int => $state->now,
    );

    return [$sampler, $cache, $state];
}

function candidate(): RecordingCandidate
{
    return new RecordingCandidate(SpanType::Agent, 'App\\Agent', null, 'Hi', null, null, 'anthropic', 'model');
}

it('records everything at one and nothing at zero without drawing', function () {
    [$all, , $allState] = samplerWith(1.0);
    [$none, , $noneState] = samplerWith(0.0);

    expect($all->records(candidate()))->toBeTrue()
        ->and($none->records(candidate()))->toBeFalse()
        ->and($allState->draws + $noneState->draws)->toBe(0);
});

it('draws once per decision between zero and one, and records below the rate only', function () {
    [$sampler, , $state] = samplerWith(0.25, [0.1, 0.25, 0.9]);

    expect([$sampler->records(candidate()), $sampler->records(candidate()), $sampler->records(candidate())])->toBe([true, false, false])
        ->and($state->draws)->toBe(3);
});

it('clamps the rate to zero to one, and treats a value that is not a number as one', function () {
    expect(samplerWith(3)[0]->records(candidate()))->toBeTrue()
        ->and(samplerWith(-1)[0]->records(candidate()))->toBeFalse()
        ->and(samplerWith('0')[0]->records(candidate()))->toBeFalse()
        ->and(samplerWith('1')[0]->records(candidate()))->toBeTrue()
        ->and(samplerWith('often')[0]->records(candidate()))->toBeTrue()
        ->and(samplerWith(null)[0]->records(candidate()))->toBeTrue();
});

it('checks without recording first, then the pause, then the filter, then the rate', function () {
    [$sampler, $cache, $state] = samplerWith(0.5, [0.9]);
    $calls = 0;
    $sampler->filter(function () use (&$calls) {
        $calls++;

        return true;
    });

    $cache->forever(Sampler::PAUSE_KEY, true);

    // Without recording: no cache read, no filter, no draw.
    expect($sampler->without(fn () => $sampler->records(candidate())))->toBeFalse()
        ->and($state->reads)->toBe(0)
        ->and($calls)->toBe(0);

    // Paused: the filter and the draw are not asked.
    expect($sampler->records(candidate()))->toBeFalse()
        ->and($calls)->toBe(0)
        ->and($state->draws)->toBe(0);

    // Not paused: the filter decides before the draw.
    $sampler->flushed();
    $cache->forget(Sampler::PAUSE_KEY);
    $sampler->filter(fn () => false);

    expect($sampler->records(candidate()))->toBeFalse()->and($state->draws)->toBe(0);

    $sampler->filter(null);

    expect($sampler->records(candidate()))->toBeFalse()->and($state->draws)->toBe(1);
});

it('reads the pause flag once, then again after a flush or after the refresh interval', function () {
    [$sampler, $cache, $state] = samplerWith();

    expect($sampler->records(candidate()))->toBeTrue()->and($state->reads)->toBe(1);

    $cache->forever(Sampler::PAUSE_KEY, true);

    expect($sampler->records(candidate()))->toBeTrue()->and($state->reads)->toBe(1);

    $state->now += 4_000_000_000;

    expect($sampler->records(candidate()))->toBeTrue()->and($state->reads)->toBe(1);

    $state->now += 2_000_000_000;

    expect($sampler->records(candidate()))->toBeFalse()->and($state->reads)->toBe(2);

    $cache->forget(Sampler::PAUSE_KEY);
    $sampler->flushed();

    expect($sampler->records(candidate()))->toBeTrue()->and($state->reads)->toBe(3);
});

it('pauses and resumes through the cache', function () {
    [$sampler, $cache] = samplerWith();

    $sampler->pause();
    expect($cache->get(Sampler::PAUSE_KEY))->toBeTrue();

    $sampler->resume();
    expect($cache->get(Sampler::PAUSE_KEY))->toBeNull();
});

it('nests without recording and restores the depth when the callback throws', function () {
    [$sampler] = samplerWith();

    $inner = $sampler->without(fn () => $sampler->without(fn () => $sampler->records(candidate())));

    try {
        $sampler->without(fn () => throw new RuntimeException('boom'));
    } catch (RuntimeException) {
        // Restored all the same.
    }

    expect($inner)->toBeFalse()->and($sampler->records(candidate()))->toBeTrue();
});

it('records on anything but false from the filter, and when the filter throws', function () {
    [$sampler] = samplerWith();

    foreach ([null, 0, '', [], true] as $answer) {
        $sampler->filter(fn () => $answer);

        expect($sampler->records(candidate()))->toBeTrue();
    }

    $sampler->filter(fn () => false);
    expect($sampler->records(candidate()))->toBeFalse();

    $sampler->filter(fn () => throw new RuntimeException('Filter broke'));
    expect($sampler->records(candidate()))->toBeTrue();
});

it('is suppressed inside withoutRecording and while the filter runs, and not after', function () {
    [$sampler] = samplerWith();
    $during = [];
    $sampler->filter(function () use ($sampler, &$during) {
        $during[] = $sampler->suppressed();

        return true;
    });

    $sampler->records(candidate());

    expect($during)->toBe([true])->and($sampler->suppressed())->toBeFalse()
        ->and($sampler->without(fn () => $sampler->suppressed()))->toBeTrue();
});

it('restores recording after a filter that throws', function () {
    [$sampler] = samplerWith();
    $sampler->filter(fn () => throw new RuntimeException('Filter broke'));

    $sampler->records(candidate());

    expect($sampler->suppressed())->toBeFalse();
});

it('only builds the candidate when there is a filter to show it to', function () {
    [$sampler] = samplerWith();
    $built = 0;
    $make = function () use (&$built) {
        $built++;

        return candidate();
    };

    $sampler->records($make);
    $sampler->filter(fn () => true);
    $sampler->records($make);

    expect($built)->toBe(1)->and($sampler->hasFilter())->toBeTrue();
});

it('draws a number from zero up to but not including one, whatever mt_srand was given', function () {
    mt_srand(1);
    $config = new Repository(['trail' => ['sampling' => 0.5]]);
    $factory = new class implements Factory
    {
        public function store($name = null): CacheContract
        {
            return new CacheRepository(new ArrayStore);
        }
    };

    $draws = [];
    $reflection = new ReflectionClass(Sampler::class);
    $sampler = new Sampler($config, $factory);
    $draw = $reflection->getProperty('draw')->getValue($sampler);

    foreach (range(1, 200) as $i) {
        $draws[] = $draw();
    }

    mt_srand(1);
    $again = $reflection->getProperty('draw')->getValue(new Sampler($config, $factory));
    $second = array_map(fn () => $again(), range(1, 200));

    expect(min($draws))->toBeGreaterThanOrEqual(0.0)->and(max($draws))->toBeLessThan(1.0)
        ->and($draws)->not->toBe($second);
});
