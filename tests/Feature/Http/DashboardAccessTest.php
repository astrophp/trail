<?php

use Astro\Trail\Facades\Trail;
use Astro\Trail\Http\Middleware\Authorize;
use Illuminate\Auth\GenericUser;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Who reaches the dashboard
|--------------------------------------------------------------------------
|
| The test application's environment is "testing", so a request is checked
| unless a test sets it to "local".
|
*/

function viewer(string $email = 'ada@example.com'): GenericUser
{
    return new GenericUser(['id' => 1, 'email' => $email]);
}

function defineTheGate(): void
{
    Gate::define('viewTrail', fn ($user) => $user->email === 'ada@example.com');
}

it('is open in the local environment without a user', function () {
    $this->app['env'] = 'local';

    $this->get('/trail')->assertOk();
});

it('is open in the local environment to any user, gate or not', function () {
    $this->app['env'] = 'local';
    defineTheGate();

    $this->actingAs(viewer('other@example.com'))->get('/trail')->assertOk();
});

it('denies a guest outside the local environment', function () {
    $this->app['env'] = 'production';
    defineTheGate();

    $this->get('/trail')->assertForbidden();
});

it('denies a user the gate rejects', function () {
    $this->app['env'] = 'production';
    defineTheGate();

    $this->actingAs(viewer('other@example.com'))->get('/trail')->assertForbidden();
});

it('allows a user the gate accepts', function () {
    $this->app['env'] = 'production';
    defineTheGate();

    $this->actingAs(viewer())->get('/trail')->assertOk()->assertSee('Trail');
});

it('denies a guest when the gate cannot be called without a user', function () {
    $this->app['env'] = 'production';
    Gate::define('viewTrail', fn (GenericUser $user) => true);

    $this->get('/trail')->assertForbidden();
});

it('lets a gate that accepts guests admit them', function () {
    $this->app['env'] = 'production';
    Gate::define('viewTrail', fn (?GenericUser $user) => true);

    $this->get('/trail')->assertOk();
});

it('denies everyone when no viewTrail gate is defined', function () {
    $this->app['env'] = 'production';

    expect(Gate::has('viewTrail'))->toBeFalse();

    $this->actingAs(viewer())->get('/trail')->assertForbidden();
});

it('answers api paths the same way: 403 for a guest, 403 for a rejected user, the JSON 404 for an allowed one', function () {
    $this->app['env'] = 'production';
    defineTheGate();

    $this->getJson('/trail/api/anything')->assertForbidden();
    $this->actingAs(viewer('other@example.com'))->getJson('/trail/api/anything')->assertForbidden();
    $this->actingAs(viewer())->getJson('/trail/api/anything')->assertNotFound();
});

it('answers api paths in the local environment with the JSON 404', function () {
    $this->app['env'] = 'local';

    $this->get('/trail/api/anything')->assertNotFound();
});

it('never redirects a denied request', function () {
    $this->app['env'] = 'production';
    defineTheGate();

    expect($this->get('/trail')->isRedirection())->toBeFalse()
        ->and($this->get('/trail/api/x')->isRedirection())->toBeFalse();
});

it('lets Trail::auth() allow a request in production without any gate', function () {
    $this->app['env'] = 'production';
    Trail::auth(fn (Request $request) => true);

    $this->get('/trail')->assertOk();
});

it('lets Trail::auth() deny a request in the local environment', function () {
    $this->app['env'] = 'local';
    Trail::auth(fn (Request $request) => false);

    $this->get('/trail')->assertForbidden();
});

it('hands the request to the Trail::auth() callback', function () {
    $seen = null;
    Trail::auth(function (Request $request) use (&$seen) {
        $seen = $request->path();

        return true;
    });

    $this->get('/trail/traces/abc')->assertOk();

    expect($seen)->toBe('trail/traces/abc');
});

it('goes back to the default check after Trail::auth(null)', function () {
    $this->app['env'] = 'production';
    Trail::auth(fn (Request $request) => true);
    $this->get('/trail')->assertOk();

    Trail::auth(null);

    $this->get('/trail')->assertForbidden();
});

it('keeps a single Trail instance behind the facade, so the callback is shared', function () {
    Trail::auth(fn (Request $request) => false);

    expect($this->app->make(Astro\Trail\Trail::class)->check(Request::create('/trail')))->toBeFalse();
});

it('does not list the access check in the middleware setting', function () {
    expect(config('trail.middleware'))->toBe(['web']);

    $middleware = Route::getRoutes()->getByName('trail.dashboard')->gatherMiddleware();

    expect($middleware)->toContain('web', Authorize::class)
        ->and(array_search(Authorize::class, $middleware))->toBeGreaterThan(array_search('web', $middleware));
});

it('grants access from the callback only on true', function () {
    $this->app['env'] = 'local';

    Trail::auth(fn (Request $request) => 'yes');
    $this->get('/trail')->assertForbidden();

    Trail::auth(fn (Request $request) => Gate::inspect('viewTrail'));
    $this->get('/trail')->assertForbidden();
});

it('denies a guest every method on an api path', function (string $method) {
    $this->app['env'] = 'production';
    defineTheGate();

    $this->withSession(['_token' => 'token'])
        ->json($method, '/trail/api/traces', ['_token' => 'token'])->assertForbidden();
})->with(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);

it('answers 404 once a switch is turned off, even where the routes are still registered', function (string $switch) {
    $this->app['env'] = 'local';
    $this->get('/trail')->assertOk();

    config([$switch => false]);

    $this->get('/trail')->assertNotFound();
    $this->get('/trail/api/x')->assertNotFound();
})->with(['trail.enabled', 'trail.dashboard.enabled']);
