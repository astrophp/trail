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
    | Trail Dashboard
    |--------------------------------------------------------------------------
    |
    | When disabled, Trail registers no dashboard routes, so the path below
    | answers 404, and keeps recording.
    |
    */

    'dashboard' => [
        'enabled' => (bool) env('TRAIL_DASHBOARD_ENABLED', true),
    ],

    /*
    |--------------------------------------------------------------------------
    | Laravel Boost MCP Tools
    |--------------------------------------------------------------------------
    |
    | When Boost is installed, Trail adds its read-only trace tools to Boost's
    | MCP server. Set this to false to leave Boost's tool list untouched.
    |
    */

    'boost' => [
        'enabled' => (bool) env('TRAIL_BOOST_ENABLED', true),
    ],

    /*
    |--------------------------------------------------------------------------
    | Trail Path and Domain
    |--------------------------------------------------------------------------
    |
    | Where the dashboard is served. Slashes around the path are ignored, and an
    | empty path means "trail": the dashboard answers every address under its
    | path, so it is never served from the root. A null domain serves it on
    | every domain the application answers. With cached routes, both are fixed
    | when the route cache is built.
    |
    */

    'path' => env('TRAIL_PATH', 'trail'),

    'domain' => env('TRAIL_DOMAIN'),

    /*
    |--------------------------------------------------------------------------
    | Trail Middleware
    |--------------------------------------------------------------------------
    |
    | The middleware every dashboard request passes through. Trail's own access
    | check is not listed here: it is always added after these, so editing this
    | list can never remove it. A request that fails the check gets a 403 and is
    | never redirected to a login page. To send guests to one, add your own
    | "auth" middleware here.
    |
    */

    'middleware' => ['web'],

    /*
    |--------------------------------------------------------------------------
    | Trail Guard
    |--------------------------------------------------------------------------
    |
    | The authentication guard whose user is checked against the viewTrail gate.
    | Null uses the application's default guard.
    |
    */

    'guard' => env('TRAIL_GUARD'),

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
    | It must be a positive number: anything else and the command deletes nothing.
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
    | Sampling
    |--------------------------------------------------------------------------
    |
    | The share of top-level runs Trail records, from 0 (none) to 1 (all). A
    | sub-agent or an embeddings call inside a run follows that run. Whether a run
    | is recorded is decided when it starts, so a sampled-out run that later
    | fails is not recorded either. A value that is not a number is reported and
    | treated as 1.
    |
    | Other controls, set in code:
    |
    |   Trail::filter(fn (RecordingCandidate $run) => ...) decides per run, from
    |   its agent class, prompt, user, provider and model: return false to skip
    |   it, anything else to record it; runs the filter itself starts are not
    |   recorded. Trail::withoutRecording(fn () => ...) records nothing that
    |   starts inside it and returns what the callback returns: not a run, and
    |   not a sub-agent or embeddings call made under a run that is being
    |   recorded (the tool that made the call is recorded, as it started
    |   outside). What starts inside stays unrecorded even if it ends later; runs
    |   already in progress are not affected.
    |
    | "php artisan trail:pause" stops recording in every process, without a
    | deploy, until "php artisan trail:resume". It keeps its flag in your default
    | cache store, so that store must be shared between processes: with the
    | "array" or "null" driver the flag only reaches the process that set it. A
    | process reads the flag at its first run after a flush (the end of a request
    | or job) and again at the next run once five seconds have passed, so a long
    | job still notices a pause. With the database cache driver each read is a
    | query, issued before the run starts. Runs already in progress finish
    | recording. "enabled" above turns Trail off completely instead: nothing is
    | registered and nothing is recorded.
    |
    */

    'sampling' => env('TRAIL_SAMPLING', 1.0),

    /*
    |--------------------------------------------------------------------------
    | Payload Capture
    |--------------------------------------------------------------------------
    |
    | What Trail stores of the prompts, messages, tool arguments and results and
    | model output of each run. "enabled" turns payload storage off entirely: runs,
    | steps, timings, usage, cost and error classes are still recorded, but no
    | input, output or excerpt is, and neither are the arguments of a pending
    | approval. Exception messages are diagnostic rather than content, so they are
    | kept, redacted and truncated like any other text.
    |
    | "system_prompt" controls whether the agent's instructions are read and
    | stored. Trail calls instructions() once per run for this, in addition to the
    | SDK's own calls; set it to false to stop that.
    |
    | "max_length" is the longest any single string is kept, in characters;
    | longer ones are cut and the span is marked truncated. Use null
    | for no limit. Zero and negative values are not limits and use the default.
    | A number read from an environment variable as text is accepted. Together
    | the strings of one captured field are kept to 100 times this length; what
    | is past that is dropped.
    |
    */

    'capture' => [
        'enabled' => true,
        'system_prompt' => true,
        'max_length' => 10000,
        // Capability arrays are also bounded to 1000 values and 64 KiB across input and output.
        'max_items' => 100,
    ],

    /*
    |--------------------------------------------------------------------------
    | Redaction
    |--------------------------------------------------------------------------
    |
    | Secrets are removed before anything is stored, and before text is cut to
    | its maximum length, so a secret cut in half cannot slip past a pattern.
    |
    | A value under one of the "keys" is replaced as a whole, at any depth. Keys
    | match ignoring case, dashes, underscores and spaces. An entry matches the
    | key exactly, so "token" does not match "input_tokens", unless it starts
    | with "*", which matches any key that ends in the rest: "*password" covers
    | "password", "db_password" and "DB-PASSWORD". A "*" is only allowed as the
    | first character. The same keys also redact the value in the quoted forms
    | inside any text, such as {"password":"hunter2"}, 'password': 'hunter2' and
    | the same with escaped quotes. Only that value is replaced.
    |
    | Every string, and every array key, is also scrubbed with the "patterns"
    | (regular expressions, each match is replaced). The defaults cover bearer
    | tokens, HTTP Basic credentials, the password in a URL, common provider API
    | keys, AWS keys, JSON web tokens and private key blocks, and are kept narrow
    | so ordinary text is left alone. Keep your own patterns linear: avoid
    | nested quantifiers and an unbounded lookahead from a repeatable start. A
    | pattern that is not valid is reported once, with the reason, and skipped.
    | A string a pattern cannot be run on is replaced as a whole.
    |
    | Only the first "max_length" plus a few thousand characters of a string are
    | scanned, since nothing past that is stored.
    |
    | What cannot be found: a secret in free text with no recognisable shape, such
    | as a password in a sentence, is not redacted.
    |
    */

    'redaction' => [
        'enabled' => true,

        'keys' => [
            '*password', '*passwd', '*pwd', '*passphrase', '*password_confirmation',
            '*secret', '*secret_key', '*secret_access_key', '*access_key', '*api_key', '*private_key',
            '*token', '*authorization', '*cookie', 'credentials',
        ],

        'patterns' => [
            // An HTTP bearer token: the word Bearer, then a long run that looks random (a digit, a dot or an underscore in its first 64 characters).
            '/\b(?:Bearer|bearer|BEARER)\s{1,8}+(?=[A-Za-z0-9\-._~+\/]{0,63}?[0-9._])[A-Za-z0-9\-._~+\/]{16,}+=*+/',
            // An HTTP Basic credential after its Authorization label; the label stays.
            '/\b(?:[Aa]uthorization|AUTHORIZATION)\\\\?["\']?\s{0,8}+[:=]\s{0,8}+\\\\?["\']?(?:[Bb]asic|BASIC)\s{1,8}+\K[A-Za-z0-9+\/]{8,}+=*+/',
            // The password in a URL's userinfo (scheme://user:password@host); the rest of the URL stays.
            '/\b[A-Za-z][A-Za-z0-9+.\-]{1,15}:\/\/[^\s:\/@"\'\\\\]{1,128}+:\K[^\s@\/"\'\\\\]{1,128}+(?=@)/',
            // Provider API keys: OpenAI and Anthropic (sk-, sk-ant-, sk-proj-), and the like. Short hyphenated words are left alone: the key must hold an unbroken run of 24 characters or more.
            '/\b(?:sk|pk|rk)-(?:[A-Za-z0-9_]{1,32}-){0,5}[A-Za-z0-9_]{24,}+[A-Za-z0-9_\-]*+/',
            // Stripe keys.
            '/\b(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]{16,}+/',
            // GitHub and GitLab tokens.
            '/\bgh[pousr]_[A-Za-z0-9]{36,255}+\b/',
            '/\bgithub_pat_[A-Za-z0-9_]{22,255}+/',
            '/\bglpat-[A-Za-z0-9_\-]{20,}+/',
            // Slack tokens and incoming-webhook URLs.
            '/\bxox[abposr]-[A-Za-z0-9\-]{10,}+/',
            '/\bxapp-\d-[A-Za-z0-9\-]{10,}+/',
            '/\bhttps:\/\/hooks\.slack\.com\/(?:services|triggers)\/[A-Za-z0-9]{8,}+\/[A-Za-z0-9]{8,}+\/[A-Za-z0-9]{20,}+/',
            // SendGrid, npm, Hugging Face and Twilio API key SIDs.
            '/\bSG\.[A-Za-z0-9_\-]{22}\.[A-Za-z0-9_\-]{43}(?![A-Za-z0-9_\-])/',
            '/\bnpm_[A-Za-z0-9]{36}(?![A-Za-z0-9])/',
            '/\bhf_[A-Za-z0-9]{30,}+/',
            '/\bSK[0-9a-f]{32}(?![0-9A-Za-z])/',
            // Google API keys.
            '/\bAIza[0-9A-Za-z_\-]{35}\b/',
            // AWS access key ids, and secret access keys when they are introduced by their label.
            '/\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/',
            '/\b(?:aws|AWS|Aws)[_\- ]?(?:secret|SECRET|Secret)[_\- ]?(?:(?:access|ACCESS|Access)[_\- ]?)?(?:key|KEY|Key)\b\\\\?["\']?\s{0,8}+[:=]\s{0,8}+\\\\?["\']?[A-Za-z0-9\/+=]{40}(?![A-Za-z0-9\/+=])/',
            // An Azure storage account key in a connection string.
            '/\bAccountKey=[A-Za-z0-9+\/]{40,}+={0,2}/',
            // JSON web tokens. They may only start where a token's characters do not continue from the left.
            '/(?<![A-Za-z0-9_\-])eyJ[A-Za-z0-9_\-]{10,}+\.eyJ[A-Za-z0-9_\-]{10,}+\.[A-Za-z0-9_\-]{10,}+/',
            // Private key blocks, complete or cut short, also with their line breaks escaped as \n. The body of a
            // block ends at the first "--", so a scan never reaches past the next block. The patterns that
            // ignore case are spelled out, since the caseless flag makes a scan far slower on hostile text.
            '/-----BEGIN (?:[A-Z0-9]{1,16} ){0,4}PRIVATE KEY(?: BLOCK)?-----(?:[^-]++|-(?!-)){0,64}+-----END (?:[A-Z0-9]{1,16} ){0,4}PRIVATE KEY(?: BLOCK)?-----/',
            '/-----BEGIN (?:[A-Z0-9]{1,16} ){0,4}PRIVATE KEY(?: BLOCK)?-----[A-Za-z0-9+\/=\s\\\\]*+/',
        ],
    ],

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
    | and model id, used to estimate token-based calls. Reranking entries use
    | an explicit "input_tokens" (USD per million) or "search_units" (USD
    | per unit) basis in their own "reranking" group. Rates
    | saved from the dashboard override the ones here.
    |
    | "input" is the rate for uncached input tokens. "cache_read" and
    | "cache_write" price tokens read from and written to a prompt cache. A
    | rate that is left out is unknown, not free: usage that needs it is
    | shown as unpriced. Use 0 for something that really costs nothing.
    |
    | A dated or "-latest" variant of a model listed here (for example
    | "gpt-5-2025-08-07" for "gpt-5") uses the same rates unless an exact
    | entry overrides it. Any other model is unpriced until it is added.
    |
    | Verified against official sources on 2026-10-14. See docs/price-sources.md
    | for all entries, sources, aliases and exceptions. Defaults use standard,
    | non-batch base rates; DeepSeek uses peak rates and Jina the USD 50 / 1B
    | token package. They exclude long-context, regional and service-tier
    | surcharges, cache storage fees and Anthropic's one-hour cache writes
    | (the five-minute rate is used). Gemini rates use non-audio input prices.
    | Some introductory prices have an announced end date; this static table
    | never switches prices automatically. Saved prices override defaults.
    |
    */

    'pricing' => [

        // https://platform.claude.com/docs/en/about-claude/pricing
        'anthropic' => [
            'claude-fable-5-1' => ['input' => 10.00, 'output' => 50.00, 'cache_read' => 0.25, 'cache_write' => 12.50],
            'claude-fable-5' => ['input' => 10.00, 'output' => 50.00, 'cache_read' => 1.00, 'cache_write' => 12.50],
            'claude-opus-5-5' => ['input' => 4.00, 'output' => 20.00, 'cache_read' => 0.20, 'cache_write' => 5.00],
            'claude-opus-5' => ['input' => 5.00, 'output' => 25.00, 'cache_read' => 0.50, 'cache_write' => 6.25],
            'claude-opus-4-8' => ['input' => 5.00, 'output' => 25.00, 'cache_read' => 0.50, 'cache_write' => 6.25],
            'claude-opus-4-7' => ['input' => 5.00, 'output' => 25.00, 'cache_read' => 0.50, 'cache_write' => 6.25],
            'claude-opus-4-6' => ['input' => 5.00, 'output' => 25.00, 'cache_read' => 0.50, 'cache_write' => 6.25],
            'claude-opus-4-5' => ['input' => 5.00, 'output' => 25.00, 'cache_read' => 0.50, 'cache_write' => 6.25],
            'claude-sonnet-5-5' => ['input' => 2.00, 'output' => 10.00, 'cache_read' => 0.10, 'cache_write' => 2.50],
            'claude-sonnet-5' => ['input' => 2.00, 'output' => 10.00, 'cache_read' => 0.20, 'cache_write' => 2.50],
            'claude-sonnet-4-6' => ['input' => 3.00, 'output' => 15.00, 'cache_read' => 0.30, 'cache_write' => 3.75],
            'claude-sonnet-4-5' => ['input' => 3.00, 'output' => 15.00, 'cache_read' => 0.30, 'cache_write' => 3.75],
            'claude-haiku-4-5' => ['input' => 1.00, 'output' => 5.00, 'cache_read' => 0.10, 'cache_write' => 1.25],
            'claude-haiku-5-5' => ['input' => 0.10, 'output' => 0.50, 'cache_read' => 0.01, 'cache_write' => 0.125],
            'claude-mythos-5-1' => ['input' => 10.00, 'output' => 50.00, 'cache_read' => 0.25, 'cache_write' => 12.50],
            'claude-mythos-5' => ['input' => 10.00, 'output' => 50.00, 'cache_read' => 1.00, 'cache_write' => 12.50],
            'claude-opus-4-1' => ['input' => 15.00, 'output' => 75.00, 'cache_read' => 1.50, 'cache_write' => 18.75],
            'claude-opus-4' => ['input' => 15.00, 'output' => 75.00, 'cache_read' => 1.50, 'cache_write' => 18.75],
            'claude-sonnet-4' => ['input' => 3.00, 'output' => 15.00, 'cache_read' => 0.30, 'cache_write' => 3.75],
            'claude-3-5-haiku' => ['input' => 0.80, 'output' => 4.00, 'cache_read' => 0.08, 'cache_write' => 1.00],
        ],

        // https://developers.openai.com/api/docs/pricing
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
            'gpt-5.6-sol' => ['input' => 4.00, 'output' => 20.00, 'cache_read' => 0.40, 'cache_write' => 5.00],
            'gpt-4o-2024-05-13' => ['input' => 5.00, 'output' => 15.00],
            'o1-pro' => ['input' => 150.00, 'output' => 600.00],
            'gpt-4-turbo-2024-04-09' => ['input' => 10.00, 'output' => 30.00],
            'gpt-4-0613' => ['input' => 30.00, 'output' => 60.00],
            'gpt-3.5-turbo' => ['input' => 0.50, 'output' => 1.50],
            'gpt-3.5-turbo-1106' => ['input' => 1.00, 'output' => 2.00],
            'gpt-5.6' => ['input' => 4.00, 'output' => 20.00, 'cache_read' => 0.40, 'cache_write' => 5.00],
            'gpt-5.6-cyber' => ['input' => 12.50, 'output' => 75.00, 'cache_read' => 1.25, 'cache_write' => 15.625],
            'gpt-5.5-cyber' => ['input' => 12.50, 'output' => 75.00, 'cache_read' => 1.25],
            'gpt-rosalind-research' => ['input' => 5.00, 'output' => 25.00, 'cache_read' => 0.50],
            'gpt-rosalind-discovery' => ['input' => 5.00, 'output' => 25.00, 'cache_read' => 0.50],
        ],

        // https://ai.google.dev/gemini-api/docs/pricing
        'gemini' => [
            'gemini-3.8-flash' => ['input' => 0.75, 'output' => 3.75, 'cache_read' => 0.075],
            'gemini-3.7-flash' => ['input' => 0.75, 'output' => 3.75, 'cache_read' => 0.075],
            'gemini-3.6-flash' => ['input' => 0.75, 'output' => 3.75, 'cache_read' => 0.075],
            'gemini-3.5-flash' => ['input' => 0.75, 'output' => 3.75, 'cache_read' => 0.075],
            'gemini-3.5-flash-lite' => ['input' => 0.30, 'output' => 2.50, 'cache_read' => 0.03],
            'gemini-3.1-flash-lite' => ['input' => 0.25, 'output' => 1.50, 'cache_read' => 0.025],
            'gemini-3.1-pro-preview' => ['input' => 2.00, 'output' => 12.00, 'cache_read' => 0.20],
            'gemini-3-flash-preview' => ['input' => 0.50, 'output' => 3.00, 'cache_read' => 0.05],
            'gemini-2.5-pro' => ['input' => 1.25, 'output' => 10.00, 'cache_read' => 0.125],
            'gemini-2.5-flash' => ['input' => 0.30, 'output' => 2.50, 'cache_read' => 0.03],
            'gemini-2.5-flash-lite' => ['input' => 0.10, 'output' => 0.40, 'cache_read' => 0.01],
            'gemini-embedding-2' => ['input' => 0.20],
            'gemini-4-argon' => ['input' => 2.00, 'output' => 10.00, 'cache_read' => 0.10],
            'gemini-3.1-pro-preview-customtools' => ['input' => 2.00, 'output' => 12.00, 'cache_read' => 0.20],
            'gemini-robotics-er-2-preview' => ['input' => 1.00, 'output' => 5.00, 'cache_read' => 0.10],
        ],

        // https://docs.mistral.ai/inference/pricing
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
            'mistral-large-4' => ['input' => 0.68, 'output' => 2.09, 'cache_read' => 0.07],
        ],

        // https://docs.x.ai/developers/models
        'xai' => [
            'grok-4.7' => ['input' => 2.00, 'output' => 6.00, 'cache_read' => 0.50],
            'grok-4.6' => ['input' => 2.00, 'output' => 6.00, 'cache_read' => 0.50],
            'grok-4.5' => ['input' => 2.00, 'output' => 6.00, 'cache_read' => 0.30],
            'grok-4.3' => ['input' => 1.25, 'output' => 2.50, 'cache_read' => 0.20],
            'grok-4.20-0309-reasoning' => ['input' => 1.25, 'output' => 2.50, 'cache_read' => 0.20],
            'grok-4.20-0309-non-reasoning' => ['input' => 1.25, 'output' => 2.50, 'cache_read' => 0.20],
            'grok-4.20-multi-agent-0309' => ['input' => 1.25, 'output' => 2.50, 'cache_read' => 0.20],
            'grok-build-0.1' => ['input' => 1.00, 'output' => 2.00, 'cache_read' => 0.20],
            'grok-4.20-non-reasoning' => ['input' => 1.25, 'output' => 2.50, 'cache_read' => 0.20],
            'grok-4.20-multi-agent' => ['input' => 1.25, 'output' => 2.50, 'cache_read' => 0.20],
            'grok-4.20' => ['input' => 1.25, 'output' => 2.50, 'cache_read' => 0.20],
            'grok-4.20-reasoning' => ['input' => 1.25, 'output' => 2.50, 'cache_read' => 0.20],
            'grok-build-latest' => ['input' => 2.00, 'output' => 6.00, 'cache_read' => 0.30],
            'grok-code-fast-1' => ['input' => 1.00, 'output' => 2.00, 'cache_read' => 0.20],
            'grok-code-fast' => ['input' => 1.00, 'output' => 2.00, 'cache_read' => 0.20],
        ],

        // https://console.groq.com/docs/models
        'groq' => [
            'openai/gpt-oss-120b' => ['input' => 0.15, 'output' => 0.60, 'cache_read' => 0.075],
            'openai/gpt-oss-20b' => ['input' => 0.075, 'output' => 0.30, 'cache_read' => 0.0375],
            'openai/gpt-oss-safeguard-20b' => ['input' => 0.075, 'output' => 0.30],
            'qwen/qwen3.8-27b' => ['input' => 0.80, 'output' => 4.00],
            'meta-llama/llama-prompt-guard-2-22m' => ['input' => 0.03, 'output' => 0.03],
            'meta-llama/llama-prompt-guard-2-86m' => ['input' => 0.04, 'output' => 0.04],
        ],

        // https://docs.voyageai.com/docs/pricing
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
            'voyage-context-3' => ['input' => 0.18],
            'voyage-code-3' => ['input' => 0.18],
            'voyage-3-large' => ['input' => 0.18],
            'voyage-3.5' => ['input' => 0.06],
            'voyage-3' => ['input' => 0.06],
            'voyage-3.5-lite' => ['input' => 0.02],
            'voyage-3-lite' => ['input' => 0.02],
            'voyage-large-2-instruct' => ['input' => 0.12],
            'voyage-large-2' => ['input' => 0.12],
            'voyage-01' => ['input' => 0.10],
            'voyage-lite-01' => ['input' => 0.10],
            'voyage-lite-01-instruct' => ['input' => 0.10],
            'voyage-02' => ['input' => 0.10],
            'voyage-lite-02-instruct' => ['input' => 0.10],
            'voyage-2' => ['input' => 0.10],
            'rerank-3' => ['reranking' => ['basis' => 'input_tokens', 'input' => 0.05]],
            'rerank-2.5' => ['reranking' => ['basis' => 'input_tokens', 'input' => 0.05]],
            'rerank-2' => ['reranking' => ['basis' => 'input_tokens', 'input' => 0.05]],
            'rerank-1' => ['reranking' => ['basis' => 'input_tokens', 'input' => 0.05]],
            'rerank-3-lite' => ['reranking' => ['basis' => 'input_tokens', 'input' => 0.02]],
            'rerank-2.5-lite' => ['reranking' => ['basis' => 'input_tokens', 'input' => 0.02]],
            'rerank-2-lite' => ['reranking' => ['basis' => 'input_tokens', 'input' => 0.02]],
            'rerank-lite-1' => ['reranking' => ['basis' => 'input_tokens', 'input' => 0.02]],
        ],

        // https://cohere.com/pricing
        'cohere' => [
            'command-a-03-2025' => ['input' => 2.50, 'output' => 10.00],
            'command-r7b-12-2024' => ['input' => 0.0375, 'output' => 0.15],
            'command-r-08-2024' => ['input' => 0.15, 'output' => 0.60],
            'command-r-plus-08-2024' => ['input' => 2.50, 'output' => 10.00],
            'command-r' => ['input' => 0.50, 'output' => 1.50],
            'command-r-plus' => ['input' => 3.00, 'output' => 15.00],
            'command' => ['input' => 1.00, 'output' => 2.00],
            'command-light' => ['input' => 0.30, 'output' => 0.60],
            'c4ai-aya-expanse-8b' => ['input' => 0.50, 'output' => 1.50],
            'c4ai-aya-expanse-32b' => ['input' => 0.50, 'output' => 1.50],
            'embed-v5.0-pro' => ['input' => 0.12],
            'embed-v5.0-fast' => ['input' => 0.08],
            'rerank-v4.0-pro' => ['reranking' => ['basis' => 'search_units', 'search_unit' => 0.0025]],
            'rerank-v4.0-fast' => ['reranking' => ['basis' => 'search_units', 'search_unit' => 0.002]],
        ],

        // https://jina.ai/embeddings/
        'jina' => [
            'jina-embeddings-v5-text-small' => ['input' => 0.05],
            'jina-embeddings-v5-text-nano' => ['input' => 0.05],
            'jina-embeddings-v5-omni-small' => ['input' => 0.05],
            'jina-embeddings-v5-omni-nano' => ['input' => 0.05],
            'jina-embeddings-v4' => ['input' => 0.05],
            'jina-embeddings-v3' => ['input' => 0.05],
            'jina-code-embeddings-0.5b' => ['input' => 0.05],
            'jina-code-embeddings-1.5b' => ['input' => 0.05],
            'jina-clip-v2' => ['input' => 0.05],
            'jina-reranker-v3.5' => ['reranking' => ['basis' => 'input_tokens', 'input' => 0.05]],
            'jina-reranker-v3' => ['reranking' => ['basis' => 'input_tokens', 'input' => 0.05]],
            'jina-reranker-m0' => ['reranking' => ['basis' => 'input_tokens', 'input' => 0.05]],
            'jina-reranker-v2-base-multilingual' => ['reranking' => ['basis' => 'input_tokens', 'input' => 0.05]],
        ],

        // https://api-docs.deepseek.com/quick_start/pricing
        'deepseek' => [
            'deepseek-flash' => ['input' => 0.30, 'output' => 1.20, 'cache_read' => 0.006],
            'deepseek-v4-flash' => ['input' => 0.30, 'output' => 1.20, 'cache_read' => 0.006],
            'deepseek-v4-flash-vision-exp' => ['input' => 0.30, 'output' => 1.20, 'cache_read' => 0.006],
            'deepseek-v4-pro' => ['input' => 1.32, 'output' => 3.96, 'cache_read' => 0.044],
        ],

    ],

];
