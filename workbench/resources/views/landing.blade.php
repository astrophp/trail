<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>{{ config('app.name') }}</title>
    <style>
        body { font: 16px/1.5 system-ui, sans-serif; margin: 2rem auto; max-width: 62rem; padding: 0 1rem; color: #1f2933; }
        table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
        th, td { text-align: left; padding: .5rem; border-bottom: 1px solid #d9dee3; vertical-align: top; }
        code { background: #eef1f4; padding: 0 .25rem; border-radius: 3px; }
        .error { color: #b42318; }
        .muted { color: #667085; }
        button { font: inherit; padding: .25rem .75rem; cursor: pointer; }
    </style>
</head>
<body>
    <h1>{{ config('app.name') }}</h1>
    <p>
        Mode: <strong>{{ $runner->label() }}</strong>.
        @unless ($runner->isLive())
            Scenarios run against scripted provider responses; set <code>ANTHROPIC_API_KEY</code> or <code>OPENAI_API_KEY</code> in <code>workbench/.env</code> to use a real provider.
        @endunless
    </p>
    <p>
        Recorded traces:
        @if ($traces === null)
            <strong>unavailable</strong> <span class="muted">(run <code>composer build</code> to create the database)</span>
        @else
            <strong>{{ $traces }}</strong>
        @endif
        @if (\Illuminate\Support\Facades\Route::has('trail.dashboard'))
            &middot; <a href="{{ route('trail.dashboard') }}">Open the Trail dashboard</a>
        @endif
    </p>

    @if ($results !== [])
        <h2>Last results</h2>
        <ul>
            @foreach ($results as $result)
                <li class="{{ $result['outcome'] === 'error' ? 'error' : '' }}">
                    <code>{{ $result['key'] }}</code> [{{ $result['mode'] }}] {{ $result['outcome'] }}: {{ $result['message'] }}
                </li>
            @endforeach
        </ul>
    @endif

    <h2>Scenarios</h2>
    <table>
        <thead>
            <tr><th>Scenario</th><th>What it does</th><th>Runs</th><th></th></tr>
        </thead>
        <tbody>
            @foreach ($scenarios as $scenario)
                <tr>
                    <td>{{ $scenario->title() }}<br><code>{{ $scenario->key() }}</code></td>
                    <td>{{ $scenario->description() }}</td>
                    <td>{{ $runner->runsLive($scenario) ? $runner->label() : 'offline' }}@unless ($scenario->supportsLive()) <span class="muted">(always)</span>@endunless</td>
                    <td>
                        <form method="post" action="{{ route('workbench.run', $scenario->key()) }}">
                            @csrf
                            <button type="submit">Run</button>
                        </form>
                    </td>
                </tr>
            @endforeach
        </tbody>
    </table>

    <form method="post" action="{{ route('workbench.run-all') }}">
        @csrf
        <button type="submit">Run all</button>
    </form>
</body>
</html>
