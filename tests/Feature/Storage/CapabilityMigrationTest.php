<?php

use Astro\Trail\Tests\Fixtures\Storage\Rows;
use Illuminate\Foundation\Testing\RefreshDatabaseState;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

beforeEach(function () {
    $this->artisan('migrate:fresh')->assertSuccessful();
});

afterEach(function () {
    config(['trail.storage.connection' => null]);
    $this->artisan('migrate:fresh')->assertSuccessful();
    RefreshDatabaseState::$migrated = false;
});

function capabilityColumns(): array
{
    return [
        'trail_spans' => ['search_units', 'billing_basis'],
        'trail_traces' => ['search_units', 'unknown_cost_calls', 'cost_gap_calls'],
        'trail_trace_models' => ['search_units', 'search_unit_calls', 'reported_search_unit_calls', 'unpriced_search_units', 'incomplete_calls', 'unknown_cost_calls', 'cost_gap_calls', 'unpriced_search_unit_calls', 'ambiguous_reranking_calls'],
        'trail_prices' => ['reranking_basis', 'reranking_input', 'reranking_search_unit', 'token_rates_set', 'reranking_rates_set', 'token_saved_at', 'reranking_saved_at'],
    ];
}

it('adds only nullable columns without defaults or new tables', function () {
    $tables = collect(Schema::getTables())->pluck('name')->sort()->values()->all();
    foreach (capabilityColumns() as $table => $names) {
        $columns = Rows::columnsOf($table);
        foreach ($names as $name) {
            expect($columns[$name]['nullable'])->toBeTrue("{$table}.{$name}")
                ->and($columns[$name]['default'])->toBeNull("{$table}.{$name}");
        }
    }
    $this->artisan('migrate:rollback', ['--step' => 2])->assertSuccessful();
    expect(collect(Schema::getTables())->pluck('name')->sort()->values()->all())->toBe($tables);
    foreach (capabilityColumns() as $table => $names) {
        foreach ($names as $name) {
            expect(Schema::hasColumn($table, $name))->toBeFalse();
        }
    }
});

it('upgrades the six migration baseline and rolls back without changing historical evidence', function () {
    $this->artisan('migrate:rollback', ['--step' => 2])->assertSuccessful();
    $trace = Rows::trace(['input_tokens' => 123, 'cost' => 0.25]);
    Rows::span($trace, ['input_tokens' => 123, 'cost' => 0.25]);
    Rows::price(['input' => 1.25]);
    DB::table('trail_trace_models')->insert([
        'trace_id' => $trace->id, 'provider' => 'openai', 'model' => 'test-model', 'run_name' => 'Support agent',
        'started_at' => '2026-01-01 12:00:00', 'provider_first' => true, 'steps' => 1,
        'reported_steps' => 1, 'unpriced_steps' => 0, 'input_tokens' => 123, 'cost' => 0.25,
    ]);
    $before = [];
    foreach (capabilityColumns() as $table => $names) {
        $before[$table] = (array) DB::table($table)->first();
    }
    $this->artisan('migrate')->assertSuccessful();
    foreach (capabilityColumns() as $table => $names) {
        $after = (array) DB::table($table)->first();
        foreach ($names as $name) {
            expect($after[$name])->toBeNull();
            unset($after[$name]);
        }
        expect($after)->toBe($before[$table]);
    }
    $this->artisan('migrate:rollback', ['--step' => 2])->assertSuccessful();
    foreach ($before as $table => $row) {
        expect((array) DB::table($table)->first())->toBe($row);
    }
});

it('alters and rolls back only the configured connection', function () {
    config([
        'database.connections.trail_secondary' => ['driver' => 'sqlite', 'database' => ':memory:', 'prefix' => ''],
        'trail.storage.connection' => 'trail_secondary',
    ]);
    $files = glob(dirname(__DIR__, 3).'/database/migrations/2026_10_07_*.php');
    foreach ($files as $file) {
        (require $file)->up();
    }
    $migration = require dirname(__DIR__, 3).'/database/migrations/2026_10_12_000007_add_capability_usage_and_prices.php';
    $migration->up();
    $assessments = require dirname(__DIR__, 3).'/database/migrations/2026_10_13_000008_add_capability_assessments.php';
    $assessments->up();
    foreach (capabilityColumns() as $table => $names) {
        expect(Schema::connection('trail_secondary')->hasColumns($table, $names))->toBeTrue();
    }
    $assessments->down();
    $migration->down();
    foreach (capabilityColumns() as $table => $names) {
        foreach ($names as $name) {
            expect(Schema::connection('trail_secondary')->hasColumn($table, $name))->toBeFalse()
                ->and(Schema::hasColumn($table, $name))->toBeTrue();
        }
    }
});

it('preserves the released migration contents', function () {
    $hashes = [
        '2026_10_07_000001_create_trail_traces_table.php' => '03682375f38e841c80af9244c826047f5635299723311ad929bf3af4b88dfc62',
        '2026_10_07_000002_create_trail_spans_table.php' => '7898768ec7be773b5cc8a3e329f439c968a016e1bf43c946df71ff11dda2dc07',
        '2026_10_07_000003_create_trail_prices_table.php' => 'a83f71b5a4fed8f38822842cf1085b5dd6cff4f1d344a404f7d6939318d43ee6',
        '2026_10_07_000004_create_trail_bookmarks_table.php' => '7a56147dc33fd3dcaa0c3d0ed2fce4ebc3540a86aa0952ff43a8072b2092561c',
        '2026_10_07_000005_create_trail_trace_models_table.php' => '6236187e9b5f3c7984b42c2d293e9d3f4dfc5602ab24437a8ba28e67a36f945e',
        '2026_10_07_000006_create_trail_trace_tools_table.php' => 'bd37e73d28c195db7ea03ff2c86918a7749981f91afc423cbe47c6713c150919',
    ];
    foreach ($hashes as $name => $hash) {
        expect(hash_file('sha256', dirname(__DIR__, 3).'/database/migrations/'.$name))->toBe($hash);
    }
});
