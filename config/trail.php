<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Trail Master Switch
    |--------------------------------------------------------------------------
    |
    | When disabled, Trail records nothing and registers no dashboard routes.
    | Only its artisan commands remain available.
    |
    */

    'enabled' => (bool) env('TRAIL_ENABLED', true),

    /*
    |--------------------------------------------------------------------------
    | Trail Storage
    |--------------------------------------------------------------------------
    |
    | The database connection Trail's tables live on. Null uses the
    | application's default connection.
    |
    */

    'storage' => [
        'connection' => env('TRAIL_DB_CONNECTION'),
    ],

    /*
    |--------------------------------------------------------------------------
    | Trail Retention
    |--------------------------------------------------------------------------
    |
    | The number of days to keep recorded traces. "trail:prune" deletes older
    | traces with their spans and bookmarks; "--hours" overrides this once.
    |
    | Trail never schedules its commands. To prune and sweep automatically,
    | add them to your schedule, for example in routes/console.php:
    |
    |     Schedule::command('trail:prune')->daily();
    |     Schedule::command('trail:sweep')->everyFiveMinutes();
    |
    */

    'retention' => 14,

    /*
    |--------------------------------------------------------------------------
    | Stale Runs
    |--------------------------------------------------------------------------
    |
    | The number of seconds after which a run that is still "running" is
    | treated as abandoned and shown as incomplete, because its process died
    | before it could finish. "trail:sweep" writes that status to the database;
    | until it runs, the dashboard already shows it. Set this above the
    | longest run you expect. Values below 60 behave as 60.
    |
    */

    'stale_after' => 3600,

    /*
    |--------------------------------------------------------------------------
    | Model Prices
    |--------------------------------------------------------------------------
    |
    | List prices in USD per one million tokens, keyed by AI provider driver
    | and model id, used to estimate what each step and embedding cost. Rates
    | saved from the dashboard override the ones here.
    |
    | "input" is the rate for uncached input tokens. "cache_read" and
    | "cache_write" price tokens read from and written to a prompt cache. A
    | rate that is left out is unknown, not free: usage that needs it is
    | shown as unpriced. Use 0 for something that really costs nothing.
    |
    | A dated or "-latest" variant of a model listed here (for example
    | "gpt-5-2025-08-07" for "gpt-5") uses the same rates. Any other model
    | is unpriced until it is added.
    |
    | These defaults were read from each provider's own pricing page on
    | 2026-10-07 and are the standard, non-batch rates. They do not model
    | long-context surcharges (some OpenAI, Gemini and xAI models bill more
    | above a prompt-size threshold), Anthropic's one-hour cache writes
    | (the five-minute rate is used) or cache storage fees. The Gemini 3.6,
    | 3.7 and 3.8 Flash rates are the provider's introductory prices, which
    | it has announced will double on 2027-01-01.
    |
    */

    'pricing' => [

        'anthropic' => [
            'claude-fable-5-1' => ['input' => 10.00, 'output' => 50.00, 'cache_read' => 0.25, 'cache_write' => 12.50],
            'claude-fable-5' => ['input' => 10.00, 'output' => 50.00, 'cache_read' => 1.00, 'cache_write' => 12.50],
            'claude-opus-5-5' => ['input' => 4.00, 'output' => 20.00, 'cache_read' => 0.20, 'cache_write' => 5.00],
            'claude-opus-5' => ['input' => 5.00, 'output' => 25.00, 'cache_read' => 0.50, 'cache_write' => 6.25],
            'claude-opus-4-8' => ['input' => 5.00, 'output' => 25.00, 'cache_read' => 0.50, 'cache_write' => 6.25],
            'claude-opus-4-7' => ['input' => 5.00, 'output' => 25.00, 'cache_read' => 0.50, 'cache_write' => 6.25],
            'claude-opus-4-6' => ['input' => 5.00, 'output' => 25.00, 'cache_read' => 0.50, 'cache_write' => 6.25],
            'claude-opus-4-5' => ['input' => 5.00, 'output' => 25.00, 'cache_read' => 0.50, 'cache_write' => 6.25],
            'claude-sonnet-5-5' => ['input' => 2.00, 'output' => 10.00, 'cache_read' => 0.20, 'cache_write' => 2.50],
            'claude-sonnet-5' => ['input' => 2.00, 'output' => 10.00, 'cache_read' => 0.20, 'cache_write' => 2.50],
            'claude-sonnet-4-6' => ['input' => 3.00, 'output' => 15.00, 'cache_read' => 0.30, 'cache_write' => 3.75],
            'claude-sonnet-4-5' => ['input' => 3.00, 'output' => 15.00, 'cache_read' => 0.30, 'cache_write' => 3.75],
            'claude-haiku-4-5' => ['input' => 1.00, 'output' => 5.00, 'cache_read' => 0.10, 'cache_write' => 1.25],
        ],

        'openai' => [
            'gpt-6-astra' => ['input' => 10.00, 'output' => 50.00, 'cache_read' => 1.00, 'cache_write' => 12.50],
            'gpt-6.1-sol' => ['input' => 2.00, 'output' => 10.00, 'cache_read' => 0.10, 'cache_write' => 2.50],
            'gpt-6-sol' => ['input' => 2.00, 'output' => 10.00, 'cache_read' => 0.20, 'cache_write' => 2.50],
            'gpt-6-luna' => ['input' => 0.10, 'output' => 0.50, 'cache_read' => 0.01, 'cache_write' => 0.125],
            'gpt-5.6-terra' => ['input' => 2.00, 'output' => 12.00, 'cache_read' => 0.20, 'cache_write' => 2.50],
            'gpt-5.6-luna' => ['input' => 0.20, 'output' => 1.20, 'cache_read' => 0.02, 'cache_write' => 0.25],
            'gpt-5.5' => ['input' => 5.00, 'output' => 30.00, 'cache_read' => 0.50],
            'gpt-5.5-pro' => ['input' => 30.00, 'output' => 180.00],
            'gpt-5.4' => ['input' => 2.50, 'output' => 15.00, 'cache_read' => 0.25],
            'gpt-5.4-mini' => ['input' => 0.75, 'output' => 4.50, 'cache_read' => 0.075],
            'gpt-5.4-nano' => ['input' => 0.20, 'output' => 1.25, 'cache_read' => 0.02],
            'gpt-5.4-pro' => ['input' => 30.00, 'output' => 180.00],
            'gpt-5.2' => ['input' => 1.75, 'output' => 14.00, 'cache_read' => 0.175],
            'gpt-5.2-pro' => ['input' => 21.00, 'output' => 168.00],
            'gpt-5.1' => ['input' => 1.25, 'output' => 10.00, 'cache_read' => 0.125],
            'gpt-5' => ['input' => 1.25, 'output' => 10.00, 'cache_read' => 0.125],
            'gpt-5-mini' => ['input' => 0.25, 'output' => 2.00, 'cache_read' => 0.025],
            'gpt-5-nano' => ['input' => 0.05, 'output' => 0.40, 'cache_read' => 0.005],
            'gpt-5-pro' => ['input' => 15.00, 'output' => 120.00],
            'gpt-4.1' => ['input' => 2.00, 'output' => 8.00, 'cache_read' => 0.50],
            'gpt-4.1-mini' => ['input' => 0.40, 'output' => 1.60, 'cache_read' => 0.10],
            'gpt-4.1-nano' => ['input' => 0.10, 'output' => 0.40, 'cache_read' => 0.025],
            'gpt-4o' => ['input' => 2.50, 'output' => 10.00, 'cache_read' => 1.25],
            'gpt-4o-mini' => ['input' => 0.15, 'output' => 0.60, 'cache_read' => 0.075],
            'o3' => ['input' => 2.00, 'output' => 8.00, 'cache_read' => 0.50],
            'o3-pro' => ['input' => 20.00, 'output' => 80.00],
            'o3-mini' => ['input' => 1.10, 'output' => 4.40, 'cache_read' => 0.55],
            'o4-mini' => ['input' => 1.10, 'output' => 4.40, 'cache_read' => 0.275],
            'o1' => ['input' => 15.00, 'output' => 60.00, 'cache_read' => 7.50],
            'text-embedding-3-small' => ['input' => 0.02],
            'text-embedding-3-large' => ['input' => 0.13],
            'text-embedding-ada-002' => ['input' => 0.10],
        ],

        'gemini' => [
            'gemini-3.8-flash' => ['input' => 0.75, 'output' => 3.75, 'cache_read' => 0.075],
            'gemini-3.7-flash' => ['input' => 0.75, 'output' => 3.75, 'cache_read' => 0.075],
            'gemini-3.6-flash' => ['input' => 0.75, 'output' => 3.75, 'cache_read' => 0.075],
            'gemini-3.5-flash' => ['input' => 1.50, 'output' => 9.00, 'cache_read' => 0.15],
            'gemini-3.5-flash-lite' => ['input' => 0.30, 'output' => 2.50, 'cache_read' => 0.03],
            'gemini-3.1-flash-lite' => ['input' => 0.25, 'output' => 1.50, 'cache_read' => 0.025],
            'gemini-3.1-pro-preview' => ['input' => 2.00, 'output' => 12.00, 'cache_read' => 0.20],
            'gemini-3-flash-preview' => ['input' => 0.50, 'output' => 3.00, 'cache_read' => 0.05],
            'gemini-2.5-pro' => ['input' => 1.25, 'output' => 10.00, 'cache_read' => 0.125],
            'gemini-2.5-flash' => ['input' => 0.30, 'output' => 2.50, 'cache_read' => 0.03],
            'gemini-2.5-flash-lite' => ['input' => 0.10, 'output' => 0.40, 'cache_read' => 0.01],
            'gemini-embedding-2' => ['input' => 0.20],
        ],

        'mistral' => [
            'mistral-large-2512' => ['input' => 0.50, 'output' => 1.50, 'cache_read' => 0.05],
            'mistral-medium-3-5' => ['input' => 1.50, 'output' => 7.50, 'cache_read' => 0.15],
            'mistral-small-2603' => ['input' => 0.15, 'output' => 0.60, 'cache_read' => 0.015],
            'ministral-14b-2512' => ['input' => 0.20, 'output' => 0.20, 'cache_read' => 0.02],
            'ministral-8b-2512' => ['input' => 0.15, 'output' => 0.15, 'cache_read' => 0.015],
            'ministral-3b-2512' => ['input' => 0.10, 'output' => 0.10, 'cache_read' => 0.01],
            'codestral-2508' => ['input' => 0.30, 'output' => 0.90, 'cache_read' => 0.03],
            'codestral-embed-2505' => ['input' => 0.15, 'cache_read' => 0.015],
            'mistral-embed-2312' => ['input' => 0.10],
        ],

        'xai' => [
            'grok-4.7' => ['input' => 2.00, 'output' => 6.00, 'cache_read' => 0.50],
            'grok-4.6' => ['input' => 2.00, 'output' => 6.00, 'cache_read' => 0.50],
            'grok-4.5' => ['input' => 2.00, 'output' => 6.00, 'cache_read' => 0.30],
            'grok-4.3' => ['input' => 1.25, 'output' => 2.50, 'cache_read' => 0.20],
            'grok-4.20-0309-reasoning' => ['input' => 1.25, 'output' => 2.50, 'cache_read' => 0.20],
            'grok-4.20-0309-non-reasoning' => ['input' => 1.25, 'output' => 2.50, 'cache_read' => 0.20],
            'grok-4.20-multi-agent-0309' => ['input' => 1.25, 'output' => 2.50, 'cache_read' => 0.20],
            'grok-build-0.1' => ['input' => 1.00, 'output' => 2.00, 'cache_read' => 0.20],
        ],

        'groq' => [
            'openai/gpt-oss-120b' => ['input' => 0.15, 'output' => 0.60, 'cache_read' => 0.075],
            'openai/gpt-oss-20b' => ['input' => 0.075, 'output' => 0.30, 'cache_read' => 0.037],
        ],

        'voyageai' => [
            'voyage-4-large' => ['input' => 0.12],
            'voyage-4' => ['input' => 0.06],
            'voyage-4-lite' => ['input' => 0.02],
            'voyage-code-4' => ['input' => 0.12],
            'voyage-context-4' => ['input' => 0.12],
            'voyage-finance-2' => ['input' => 0.12],
            'voyage-law-2' => ['input' => 0.12],
            'voyage-code-2' => ['input' => 0.12],
            'voyage-multilingual-2' => ['input' => 0.12],
        ],

    ],

];
