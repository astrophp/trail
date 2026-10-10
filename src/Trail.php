<?php

namespace Astro\Trail;

use Astro\Trail\Capture\Guard;
use Astro\Trail\Capture\Recorder;
use Astro\Trail\Capture\Sampler;
use Astro\Trail\Pricing\PriceBook;
use Astro\Trail\Storage\ArrayTraceStore;
use Astro\Trail\Storage\Contracts\TraceStore;
use Astro\Trail\Storage\StaleRuns;
use Astro\Trail\Users\UserResolver;
use Closure;
use Composer\InstalledVersions;
use Illuminate\Contracts\Cache\Factory as CacheFactory;
use Illuminate\Contracts\Config\Repository;
use Illuminate\Contracts\Container\Container;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\App;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Vite;
use Illuminate\Support\HtmlString;
use Illuminate\Support\Js;
use Throwable;

class Trail
{
    /** @var (Closure(array<string, list<string>>): mixed)|null */
    private ?Closure $userResolver = null;

    /** @var (Closure(Request): mixed)|null */
    private ?Closure $authCallback = null;

    public function __construct(private readonly Container $container) {}

    /**
     * The store Trail currently writes to. Resolved on every call so a later fake takes effect.
     */
    public function store(): TraceStore
    {
        return $this->container->make(TraceStore::class);
    }

    /**
     * Replace Trail's storage with an empty in-memory store, and price from `trail.pricing` alone,
     * so tests never touch its tables.
     */
    public function fake(): ArrayTraceStore
    {
        $store = new ArrayTraceStore;

        $this->container->instance(TraceStore::class, $store);
        $this->container->make(PriceBook::class)->useConfigOnly();

        return $store;
    }

    /**
     * Write every trace Trail is still holding, finished or not, and forget it. Never throws.
     * Call it between runs: a run that is still going when it is called is written as running,
     * and Trail does not follow it after that.
     */
    public function flush(): void
    {
        Guard::run(function (): void {
            $recorder = $this->container->make(Recorder::class);
            $recorder->flush();
        });
    }

    /**
     * Resolve the users traces belong to with your own code instead of Eloquent. The callback
     * receives the users grouped by type, as `array<string, list<string>>`, and returns
     * `array<string, array<string, array{name?: ?string, email?: ?string}|null>>`, type => id => user.
     * Passing null goes back to the default.
     *
     * @param  (Closure(array<string, list<string>>): mixed)|null  $callback
     */
    public function resolveUsersUsing(?Closure $callback): void
    {
        $this->userResolver = $callback;
    }

    /**
     * The resolver for the users traces belong to, using the callback given to resolveUsersUsing().
     */
    public function users(): UserResolver
    {
        return new UserResolver($this->userResolver);
    }

    /**
     * Decide which runs are recorded. The callback receives a RecordingCandidate when a top-level
     * run starts; returning false skips the run and everything under it, anything else records it.
     * Passing null removes the filter.
     *
     * @param  (Closure(RecordingCandidate): mixed)|null  $callback
     */
    public function filter(?Closure $callback): void
    {
        try {
            $this->container->make(Sampler::class)->filter($callback);
        } catch (Throwable $e) {
            Guard::run(function () use ($e): void {
                throw $e;
            });
        }
    }

    /**
     * Run the callback without recording the runs that start inside it, and return what it returns.
     * Nothing that starts inside is recorded, for its whole life even if it ends after the callback:
     * not a run, and not a sub-agent or an embeddings call made under a run that is being recorded
     * (the tool that made the call is recorded, as it started outside). Runs already in progress
     * are not affected. Calls nest.
     *
     * The setting is kept for the whole process, not for one call stack, so a Fiber that is suspended
     * inside the callback leaves recording off for other code until it resumes.
     *
     * @param  Closure(): mixed  $callback
     */
    public function withoutRecording(Closure $callback): mixed
    {
        try {
            $sampler = $this->container->make(Sampler::class);
        } catch (Throwable $e) {
            // Trail not being healthy does not stop the application's own code from running.
            Guard::run(function () use ($e): void {
                throw $e;
            });

            return $callback();
        }

        return $sampler->without($callback);
    }

    /**
     * Decide who can open the dashboard with your own code instead of the default check. The
     * callback receives the request and grants access only by returning true. It replaces the
     * check entirely, so it also applies in the local environment. Passing null goes back to
     * the default.
     *
     * @param  (Closure(Request): mixed)|null  $callback
     */
    public function auth(?Closure $callback): void
    {
        $this->authCallback = $callback;
    }

    /**
     * Whether the request may open the dashboard. Without a callback from auth(), anyone can in
     * the local environment; elsewhere the user of the configured guard must pass the viewTrail
     * gate. A guest, or a gate that is not defined, is denied.
     */
    public function check(Request $request): bool
    {
        if ($this->authCallback !== null) {
            return ($this->authCallback)($request) === true;
        }

        if (App::environment('local')) {
            return true;
        }

        $guard = $this->container->make(Repository::class)->get('trail.guard');

        return Gate::forUser($request->user(is_string($guard) ? $guard : null))->check('viewTrail');
    }

    /**
     * The dashboard's stylesheet, inlined in a style tag.
     */
    public function css(): HtmlString
    {
        $css = $this->keepInsideTag($this->container->make(Assets::class)->read('app.css'), 'style');

        return new HtmlString('<style'.$this->nonceAttribute().'>'.$css.'</style>');
    }

    /**
     * The dashboard's script as a module, inlined, after the window.Trail object the page boots from.
     */
    public function js(): HtmlString
    {
        $js = $this->keepInsideTag($this->container->make(Assets::class)->read('app.js'), 'script');

        // Inside a script, "<!--" followed later by "<script" makes the HTML parser ignore the real closing tag.
        // Like the tag rewrite, this only changes how a sequence is spelled inside string and regex literals.
        $js = str_replace('<!--', '<\\!--', $js);

        return new HtmlString('<script type="module"'.$this->nonceAttribute().'>window.Trail = '.Js::from($this->scriptVariables()).";\n".$js.'</script>');
    }

    /**
     * Keep a bundle from closing its own tag. The rewrites in here are safe because they only change
     * how a sequence is spelled inside the bundle's string and regex literals, not what it means.
     */
    private function keepInsideTag(string $code, string $tag): string
    {
        return preg_replace('#</(?='.$tag.')#i', '<\\/', $code) ?? $code;
    }

    /**
     * What the dashboard needs to start, written into the page as window.Trail.
     *
     * @return array{path: string, apiPath: string, csrfToken: ?string, appName: mixed, environment: string, timezone: mixed, version: ?string, staleAfter: int, recording: ?string}
     */
    public function scriptVariables(): array
    {
        $path = '/'.DashboardPath::prefix();
        $app = $this->application();

        return [
            'path' => $path,
            'apiPath' => $path.'/api',
            'csrfToken' => csrf_token(),
            'appName' => $app['name'],
            'environment' => $app['environment'],
            'timezone' => $app['timezone'],
            'version' => $this->version(),
            'staleAfter' => StaleRuns::timeout(),
            'recording' => $this->recording(),
        ];
    }

    /**
     * The application Trail runs in, as the dashboard shows it.
     *
     * @return array{name: mixed, environment: string, timezone: mixed}
     */
    public function application(): array
    {
        $config = $this->container->make(Repository::class);

        return ['name' => $config->get('app.name'), 'environment' => App::environment(), 'timezone' => $config->get('app.timezone')];
    }

    /**
     * The installed version of Trail, or null when Composer cannot say.
     */
    public function version(): ?string
    {
        try {
            return InstalledVersions::getPrettyVersion('astrophp/trail');
        } catch (Throwable) {
            return null;
        }
    }

    /**
     * Whether Trail is recording: enabled, paused, or disabled. Null when the pause flag cannot be
     * read, as then neither enabled nor paused would be known to be true.
     */
    public function recording(): ?string
    {
        if (! $this->container->make(Repository::class)->get('trail.enabled')) {
            return 'disabled';
        }

        $paused = rescue(fn () => (bool) $this->container->make(CacheFactory::class)->store()->get(Sampler::PAUSE_KEY, false), null);

        if ($paused === null) {
            return null;
        }

        return $paused ? 'paused' : 'enabled';
    }

    /**
     * The nonce attribute for an inline tag, from Vite::useCspNonce(), or nothing without one.
     */
    public function nonceAttribute(): string
    {
        $nonce = Vite::cspNonce();

        return is_string($nonce) && $nonce !== '' ? ' nonce="'.e($nonce).'"' : '';
    }
}
