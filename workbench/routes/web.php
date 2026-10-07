<?php

use Astro\Trail\Storage\Models\Trace;
use Illuminate\Http\RedirectResponse;
use Illuminate\Support\Facades\Route;
use Workbench\App\Http\LoopbackOnly;
use Workbench\App\Scenarios\Registry;
use Workbench\App\Scenarios\Result;
use Workbench\App\Scenarios\ScenarioRunner;

Route::middleware(LoopbackOnly::class)->group(function () {
    Route::get('/', function (ScenarioRunner $runner) {
        try {
            $traces = Trace::query()->count();
        } catch (Throwable) {
            // The tables are created by "composer build"; until then there is nothing to count.
            $traces = null;
        }

        return view('workbench::landing', [
            'runner' => $runner,
            'scenarios' => $runner->registry()->all(),
            'traces' => $traces,
            'results' => session('results', []),
        ]);
    })->name('workbench.home');

    Route::post('/run', function (ScenarioRunner $runner): RedirectResponse {
        return redirect()->route('workbench.home')->with('results', array_map(fn (Result $result) => $result->toArray(), $runner->runAll()));
    })->name('workbench.run-all');

    Route::post('/run/{scenario}', function (string $scenario, ScenarioRunner $runner, Registry $registry): RedirectResponse {
        abort_unless($registry->has($scenario), 404);

        return redirect()->route('workbench.home')->with('results', [$runner->run($registry->get($scenario))->toArray()]);
    })->name('workbench.run');
});
