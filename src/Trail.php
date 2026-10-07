<?php

namespace Astro\Trail;

use Astro\Trail\Capture\Guard;
use Astro\Trail\Capture\Recorder;
use Astro\Trail\Capture\Sampler;
use Astro\Trail\Storage\ArrayTraceStore;
use Astro\Trail\Storage\Contracts\TraceStore;
use Astro\Trail\Users\UserResolver;
use Closure;
use Illuminate\Contracts\Config\Repository;
use Illuminate\Contracts\Container\Container;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\App;
use Illuminate\Support\Facades\Gate;

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
     * Replace Trail's storage with an empty in-memory store, so tests never touch its tables.
     */
    public function fake(): ArrayTraceStore
    {
        $store = new ArrayTraceStore;

        $this->container->instance(TraceStore::class, $store);

        return $store;
    }

    /**
     * Write every trace Trail is still holding, finished or not, and forget it. Never throws.
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
        $this->container->make(Sampler::class)->filter($callback);
    }

    /**
     * Run the callback without recording the runs that start inside it, and return what it returns.
     * Nothing that starts inside is recorded, for its whole life even if it ends after the callback:
     * not a run, and not a sub-agent or an embeddings call made under a run that is being recorded
     * (the tool that made the call is recorded, as it started outside). Runs already in progress
     * are not affected. Calls nest.
     *
     * @param  Closure(): mixed  $callback
     */
    public function withoutRecording(Closure $callback): mixed
    {
        return $this->container->make(Sampler::class)->without($callback);
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
}
