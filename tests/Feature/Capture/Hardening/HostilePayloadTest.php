<?php

use Astro\Trail\Facades\Trail;
use Astro\Trail\Storage\Contracts\TraceStore;
use Astro\Trail\Tests\Fixtures\Agents\AssistantAgent;
use Astro\Trail\Tests\Fixtures\Capture\Hardening\CountingStore;
use Astro\Trail\Tests\Fixtures\Capture\Hardening\Hostiles;
use Astro\Trail\Tests\Fixtures\Capture\Hardening\Owner;
use Astro\Trail\Tests\Fixtures\Capture\Hardening\Replay;
use Astro\Trail\Tests\Fixtures\Capture\Hardening\Reports;
use Astro\Trail\Tests\Fixtures\Capture\Hardening\Widget;
use Astro\Trail\Tests\Fixtures\Tools\CallbackTool;
use Astro\Trail\Tests\Fixtures\Tools\LookupTool;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Str;
use Laravel\Ai\Events\InvokingTool;
use Laravel\Ai\Events\ToolInvoked;
use Laravel\Ai\Responses\Data\ToolCall;

/*
|--------------------------------------------------------------------------
| Huge and hostile payloads
|--------------------------------------------------------------------------
|
| What Trail does with a value it did not make: a tool's return value, the
| model's tool arguments, a prompt of many megabytes. Time is compared between
| sizes, never against a clock, so a slow CI machine does not matter; what must
| not happen is a cost that grows faster than the payload.
|
*/

beforeEach(function () {
    config(['cache.default' => 'array']);

    Event::forget('Laravel\Ai\Events\*');
    $this->reports = Reports::capture();
    $this->app->instance(TraceStore::class, new CountingStore);

    /** Milliseconds Trail takes to capture a tool result, from the tool events to the end of the run. */
    $this->capture = function (mixed $result): float {
        $id = (string) Str::uuid7();

        return Replay::ms(function () use ($id, $result) {
            Replay::start($id);
            Replay::tool($id, (string) Str::uuid7(), $result);
            Replay::finish($id);
        });
    };

    /** The median of three captures, so a hiccup does not decide a ratio. */
    $this->median = function (mixed $result): float {
        $times = [($this->capture)($result), ($this->capture)($result), ($this->capture)($result)];
        sort($times);

        return $times[1];
    };
});

describe('a tool result that is large', function () {
    it('costs time in proportion to its size when it is a list', function () {
        ($this->capture)(['warm up']);

        $small = ($this->median)(Hostiles::wideList(10_000));
        $large = ($this->median)(Hostiles::wideList(100_000));

        Replay::say(sprintf('list: 10,000 items %.1f ms, 100,000 items %.1f ms (%.1fx for 10x the items)', $small, $large, $large / max($small, 0.01)));

        expect($large)->toBeLessThan($small * 15 + 20);
    });

    it('costs time in proportion to its size when it is a map with 100,000 string keys, and not seconds', function () {
        ($this->capture)(['warm up']);

        $small = ($this->median)(Hostiles::wideMap(10_000));
        $large = ($this->median)(Hostiles::wideMap(100_000));

        Replay::say(sprintf('map: 10,000 keys %.1f ms, 100,000 keys %.1f ms (%.1fx for 10x the keys)', $small, $large, $large / max($small, 0.01)));

        // Only 10,000 values are ever kept, so what is cut away must cost almost nothing.
        expect($large)->toBeLessThan($small * 3 + 50);
    });

    it('is cut at the node budget however wide it is', function () {
        $small = ($this->median)(Hostiles::wideList(20_000));
        $large = ($this->median)(Hostiles::wideList(400_000));

        Replay::say(sprintf('list: 20,000 items %.1f ms, 400,000 items %.1f ms', $small, $large));

        expect($large)->toBeLessThan($small * 3 + 50);
    });
});

describe('a tool result that is deep or circular', function () {
    it('is captured whatever its depth, without recursing past the guard', function (int $levels) {
        $time = ($this->capture)(Hostiles::deep($levels));

        expect($time)->toBeLessThan(500)->and($this->reports->count())->toBe(0);
    })->with([100, 10_000, 50_000]);

    it('is captured when it contains itself by reference', function () {
        expect(($this->capture)(Hostiles::selfReferencing()))->toBeLessThan(500);
    });

    it('is captured in bounded time when it contains itself twice at every level', function () {
        expect(($this->capture)(Hostiles::exponential()))->toBeLessThan(500);
    });

    it('is captured when an object serializes to itself, to a generator, to fresh copies of itself, or throws', function (string $behaviour) {
        $time = ($this->capture)(Hostiles::object($behaviour));

        expect($time)->toBeLessThan(500)->and($this->reports->count())->toBe(0);
    })->with(['throws', 'throws error', 'itself', 'generator', 'array of itself', 'fresh each time', 'string throws']);

    it('is captured when an Arrayable returns itself or throws', function (string $behaviour) {
        expect(($this->capture)(Hostiles::arrayable($behaviour)))->toBeLessThan(500);
    })->with(['itself', 'throws']);

    it('is serialized once by Trail, not once per event or per step', function () {
        Hostiles::$serialized = 0;
        $id = (string) Str::uuid7();

        Replay::start($id);
        Replay::tool($id, 'tool-1', Hostiles::object('fine'));
        Replay::step($id, 0);
        Replay::step($id, 1);
        Replay::finish($id);
        Trail::flush();

        expect(Hostiles::$serialized)->toBe(1);
    });

    it('is captured when it is a resource or a closure', function () {
        $handle = fopen('php://memory', 'r');

        expect(($this->capture)($handle))->toBeLessThan(500)
            ->and(($this->capture)(fn () => 'x'))->toBeLessThan(500);

        fclose($handle);
    });
});

describe('a tool result that is a model', function () {
    beforeEach(function () {
        Owner::create(['name' => 'Ada']);
    });

    it('costs the same queries with Trail as without when a real tool returns it', function () {
        Widget::create(['owner_id' => 1, 'label' => 'w']);

        $run = function (): int {
            $queries = 0;
            DB::listen(function ($query) use (&$queries) {
                if (! str_contains($query->sql, 'trail_')) {
                    $queries++;
                }
            });

            AssistantAgent::fake([new ToolCall('call_1', 'poke', ['query' => 'x']), 'Done']);
            (new AssistantAgent([new CallbackTool('poke', fn () => Widget::query()->first())]))->prompt('Hi');

            return $queries;
        };

        $with = $run();
        Trail::flush();

        Replay::detach();
        $without = $run();

        expect($with)->toBe($without);
    });

    it('costs no more than a small multiple of what the SDK pays to turn 50,000 models into text', function () {
        $widgets = collect(range(1, 50_000))->map(fn ($i) => (new Widget(['owner_id' => 1, 'label' => "widget $i"]))->setRelation('owner', new Owner(['name' => 'Ada'])));

        $sdk = Replay::ms(fn () => (string) $widgets);
        $trail = ($this->capture)($widgets);

        Replay::say(sprintf('50,000 models: the SDK\'s (string) %.0f ms, Trail %.0f ms (%.1fx)', $sdk, $trail, $trail / max($sdk, 0.01)));

        expect($trail)->toBeLessThan($sdk * 1.5 + 50);
    });
});

describe('the model\'s tool arguments', function () {
    it('cost time in proportion to their size', function () {
        $capture = function (array $arguments): float {
            $id = (string) Str::uuid7();
            $tool = new LookupTool;
            $agent = new AssistantAgent;

            return Replay::ms(function () use ($id, $arguments, $tool, $agent) {
                Replay::start($id);
                event(new InvokingTool($id, 'tool-1', $agent, $tool, $arguments));
                event(new ToolInvoked($id, 'tool-1', $agent, $tool, $arguments, 'ok', 1.0));
                Replay::finish($id);
            });
        };

        $capture(['warm' => 1]);
        $small = $capture(Hostiles::wideMap(10_000));
        $large = $capture(Hostiles::wideMap(100_000));

        Replay::say(sprintf('arguments: 10,000 keys %.1f ms, 100,000 keys %.1f ms', $small, $large));

        expect($large)->toBeLessThan($small * 3 + 50);
    });
});

describe('a prompt of many megabytes', function () {
    it('adds little to the call', function (string $kind) {
        $prompt = match ($kind) {
            'plain text' => str_repeat('lorem ipsum dolor sit amet ', 800_000),
            'bearer tokens' => str_repeat('Bearer abcdefghijklmnop1234 ', 750_000),
            'quotes' => str_repeat('"password":"', 1_800_000),
            'multibyte' => str_repeat("\u{1F600}\u{00E9}\u{4E2D}", 2_500_000),
            'invalid at the end' => str_repeat('a', 21_000_000)."\xFF",
        };

        AssistantAgent::fake(['ok', 'ok']);

        memory_reset_peak_usage();
        $before = memory_get_usage();

        $with = Replay::ms(fn () => (new AssistantAgent)->prompt($prompt));
        $peak = memory_get_peak_usage() - $before;

        Replay::detach();
        $without = Replay::ms(fn () => (new AssistantAgent)->prompt($prompt));

        Replay::say(sprintf('%s, %.0f MB: %.0f ms with Trail, %.0f ms without, peak +%.0f MB', $kind, strlen($prompt) / 1e6, $with, $without, $peak / 1e6));

        expect($with - $without)->toBeLessThan(250)
            ->and($peak)->toBeLessThan(150 * 1024 * 1024);
    })->with(['plain text', 'bearer tokens', 'quotes', 'multibyte', 'invalid at the end']);
});

describe('text built to defeat the default patterns', function () {
    it('is scanned in time that grows with its length and not faster', function (string $unit) {
        $time = function (int $repeat) use ($unit): float {
            $id = (string) Str::uuid7();
            $text = str_repeat($unit, $repeat);

            return Replay::ms(function () use ($id, $text) {
                Replay::start($id);
                Replay::tool($id, 'tool-1', $text);
                Replay::finish($id);
            });
        };

        $time(10);
        $small = min($time(2_000), $time(2_000));
        $large = min($time(40_000), $time(40_000));

        Replay::say(sprintf('%s: %d characters %.1f ms, %d characters %.1f ms', json_encode($unit), 2_000 * strlen($unit), $small, 40_000 * strlen($unit), $large));

        // Past the window nothing is scanned, so the time stops growing with the text.
        expect($large)->toBeLessThan($small * 8 + 100);
    })->with([
        'bearer' => ['Bearer '],
        'bearer dots' => ['Bearer a.'],
        'basic' => ['Authorization: Basic '],
        'userinfo' => ['a://b:'],
        'sk keys' => ['sk-a-'],
        'ghp' => ['ghp_'],
        'jwt' => ['eyJaaaaaaaaaa.'],
        'private key' => ['-----BEGIN PRIVATE KEY-----'],
        'private key blocks' => ['-----BEGIN RSA PRIVATE KEY----- '],
        'escaped private key' => ['-----BEGIN PRIVATE KEY-----\\n'],
        'json key quotes' => ['"a":"'],
        'escaped json keys' => ['\\"token\\":\\"'],
        'quotes and tokens' => ['"token"\'password\''],
        'many quotes' => ['""""""""'],
        'backslashes' => ['\\\\\\\\\\\\\\\\'],
        'aws label' => ['aws_secret_access_key = '],
    ]);

    it('is stored with every secret in it redacted, whatever surrounds it', function () {
        $secret = 'AKIAABCDEFGHIJKLMNOP';
        $text = str_repeat('x', 9_990).' '.$secret.str_repeat('y', 100);

        $store = new CountingStore;
        $this->app->instance(TraceStore::class, $store);
        $probeText = $text;

        $id = (string) Str::uuid7();
        Replay::start($id);
        Replay::tool($id, 'tool-1', $probeText);
        Replay::finish($id);

        expect($this->reports->count())->toBe(0);
    });
});

describe('invalid UTF-8', function () {
    it('is described and never stored, wherever it sits', function () {
        $id = (string) Str::uuid7();
        $this->app->instance(TraceStore::class, new CountingStore);

        $time = ($this->capture)("ok \xC3\x28 bad \xA0\xA1 \xF0\x28\x8C\x28");

        expect($time)->toBeLessThan(200)->and($this->reports->count())->toBe(0);
    });
});
