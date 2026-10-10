<?php

use Astro\Trail\Enums\Status;
use Astro\Trail\Facades\Trail;
use Astro\Trail\Storage\Models\Bookmark;
use Astro\Trail\Storage\Models\Trace;
use Astro\Trail\Tests\Fixtures\Http\DefinesOtherGuard;
use Astro\Trail\Tests\Fixtures\Storage\Rows;
use Astro\Trail\Tests\Fixtures\Users\SignedInUser;
use Astro\Trail\Users\UserResolver;
use Illuminate\Auth\GenericUser;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;

uses(DefinesOtherGuard::class);

beforeEach(function () {
    Carbon::setTestNow('2026-01-02 12:00:00');
    // The framework skips the CSRF check in the "testing" environment, which is also where
    // access is closed to everyone but the gate; the tests open it, and set "local" only where
    // they need to.
    $this->app['env'] = 'testing';
    Trail::auth(fn () => true);
});

afterEach(function () {
    Carbon::setTestNow();
    // Some tests change the environment; a failed assertion must not leave it changed.
    $this->app['env'] = 'testing';
});

function bookmarkable(string $id = 'trace-1'): string
{
    Rows::trace(['id' => $id, 'status' => Status::Completed, 'started_at' => '2026-01-02 10:00:00']);

    return $id;
}

function signedIn(int $id, string $name = 'Ada'): SignedInUser
{
    return SignedInUser::create(['id' => $id, 'name' => $name, 'email' => "user{$id}@example.test", 'password' => 'x']);
}

it('bookmarks a run', function () {
    $id = bookmarkable();

    $this->putJson("/trail/api/traces/{$id}/bookmark")->assertOk()->assertExactJson(['data' => ['trace_id' => $id, 'bookmarked' => true]]);

    expect(Bookmark::query()->where('trace_id', $id)->count())->toBe(1);
});

it('lists a bookmarked run as bookmarked and finds it with the filter', function () {
    $id = bookmarkable();
    bookmarkable('trace-2');

    $this->putJson("/trail/api/traces/{$id}/bookmark")->assertOk();

    $rows = collect($this->getJson('/trail/api/traces')->assertOk()->json('data'))->pluck('bookmarked', 'id')->all();
    expect($rows)->toEqual(['trace-1' => true, 'trace-2' => false]);
    expect($this->getJson('/trail/api/traces?bookmarked=1')->json('data.*.id'))->toBe([$id]);
});

it('keeps one bookmark, and its first user, when a run is bookmarked again', function () {
    $id = bookmarkable();
    $first = signedIn(1);
    $second = signedIn(2, 'Grace');

    $this->actingAs($first)->putJson("/trail/api/traces/{$id}/bookmark")->assertOk();
    $this->actingAs($second)->putJson("/trail/api/traces/{$id}/bookmark")->assertOk()->assertExactJson(['data' => ['trace_id' => $id, 'bookmarked' => true]]);

    expect(Bookmark::query()->count())->toBe(1);
    expect(Bookmark::query()->firstOrFail()->user_id)->toBe('1');
});

it('removes a bookmark', function () {
    $id = bookmarkable();
    Rows::bookmark(Trace::query()->findOrFail($id));

    $this->deleteJson("/trail/api/traces/{$id}/bookmark")->assertOk()->assertExactJson(['data' => ['trace_id' => $id, 'bookmarked' => false]]);

    expect(Bookmark::query()->count())->toBe(0);
    expect($this->getJson('/trail/api/traces?bookmarked=1')->json('data'))->toBe([]);
});

it('answers a removal of a bookmark that is not there', function () {
    $id = bookmarkable();

    $this->deleteJson("/trail/api/traces/{$id}/bookmark")->assertOk()->assertExactJson(['data' => ['trace_id' => $id, 'bookmarked' => false]]);
});

it('lets anyone remove a bookmark, not only the user who added it', function () {
    $id = bookmarkable();

    $this->actingAs(signedIn(1))->putJson("/trail/api/traces/{$id}/bookmark")->assertOk();
    $this->actingAs(signedIn(2, 'Grace'))->deleteJson("/trail/api/traces/{$id}/bookmark")->assertOk()->assertJsonPath('data.bookmarked', false);

    expect(Bookmark::query()->count())->toBe(0);
});

it('answers a JSON 404 for an unknown run, whatever is asked for', function (string $method) {
    $this->call($method, '/trail/api/traces/nothing/bookmark', server: ['HTTP_ACCEPT' => 'text/html'])
        ->assertNotFound()->assertJsonStructure(['message']);
    $this->json($method, '/trail/api/traces/nothing/bookmark')->assertNotFound()->assertJsonStructure(['message']);

    expect(Bookmark::query()->count())->toBe(0);
})->with(['PUT', 'DELETE']);

it('records the user the way capture records the user of a run', function () {
    $id = bookmarkable();
    $user = signedIn(7);

    $this->actingAs($user)->putJson("/trail/api/traces/{$id}/bookmark")->assertOk();

    $bookmark = Bookmark::query()->firstOrFail();
    expect($bookmark->user_id)->toBe('7')
        ->and($bookmark->user_type)->toBe(SignedInUser::class);

    $key = UserResolver::key($bookmark->user_type, $bookmark->user_id);
    expect(Trail::users()->resolve([['id' => $bookmark->user_id, 'type' => $bookmark->user_type]]))
        ->toBe([$key => ['name' => 'Ada', 'email' => 'user7@example.test']]);
});

it('records no user without one, in the local environment', function () {
    $id = bookmarkable();
    $this->app['env'] = 'local';

    $this->withSession(['_token' => 'token'])->putJson("/trail/api/traces/{$id}/bookmark", [], ['X-CSRF-TOKEN' => 'token'])->assertOk();

    $bookmark = Bookmark::query()->firstOrFail();
    expect($bookmark->user_id)->toBeNull()
        ->and($bookmark->user_type)->toBeNull();
});

it('records no user when the configured guard does not exist', function () {
    $id = bookmarkable();
    $this->app['env'] = 'local';
    config(['trail.guard' => 'nope']);

    $this->withSession(['_token' => 'token'])->putJson("/trail/api/traces/{$id}/bookmark", [], ['X-CSRF-TOKEN' => 'token'])->assertOk();

    $bookmark = Bookmark::query()->firstOrFail();
    expect($bookmark->user_id)->toBeNull()
        ->and($bookmark->user_type)->toBeNull();
});

it('records the user of the configured guard, not the default one', function () {
    $id = bookmarkable();
    config(['trail.guard' => 'other']);

    Auth::guard('web')->setUser(signedIn(1));
    Auth::guard('other')->setUser(signedIn(2, 'Grace'));

    $this->putJson("/trail/api/traces/{$id}/bookmark")->assertOk();

    expect(Bookmark::query()->firstOrFail()->user_id)->toBe('2');
});

it('records the user of the default guard when no guard is configured', function () {
    $id = bookmarkable();

    Auth::guard('other')->setUser(signedIn(2, 'Grace'));
    Auth::guard('web')->setUser(signedIn(1));

    $this->putJson("/trail/api/traces/{$id}/bookmark")->assertOk();

    expect(Bookmark::query()->firstOrFail()->user_id)->toBe('1');
});

it('records the class and key of a user that is not a model', function () {
    $id = bookmarkable();

    $this->actingAs(new GenericUser(['id' => 5]))->putJson("/trail/api/traces/{$id}/bookmark")->assertOk();

    $bookmark = Bookmark::query()->firstOrFail();
    expect($bookmark->user_id)->toBe('5')
        ->and($bookmark->user_type)->toBe(GenericUser::class);
});

it('writes nothing for a denied request', function (string $method) {
    $id = bookmarkable();
    Rows::bookmark(Trace::query()->findOrFail($id));
    $this->app['env'] = 'production';
    Trail::auth(null);
    Gate::define('viewTrail', fn () => false);

    $this->withSession(['_token' => 'token'])->json($method, "/trail/api/traces/{$id}/bookmark", [], ['X-CSRF-TOKEN' => 'token'])->assertForbidden()->assertJsonStructure(['message']);

    expect(Bookmark::query()->count())->toBe(1);

    Bookmark::query()->delete();

    $this->withSession(['_token' => 'token'])->json($method, "/trail/api/traces/{$id}/bookmark", [], ['X-CSRF-TOKEN' => 'token'])->assertForbidden();

    expect(Bookmark::query()->count())->toBe(0);

    // The teardown rolls the test migrations back, which a command refuses to do unasked in production.
    $this->app['env'] = 'testing';
})->with(['PUT', 'DELETE']);

it('is not found when the dashboard is switched off', function (string $method) {
    $id = bookmarkable();
    config(['trail.dashboard.enabled' => false]);

    $this->json($method, "/trail/api/traces/{$id}/bookmark")->assertNotFound();
})->with(['PUT', 'DELETE']);

it('passes an id that needs encoding on as that id', function (string $stored, string $sent) {
    bookmarkable($stored);

    $this->putJson("/trail/api/traces/{$sent}/bookmark")->assertOk()->assertJsonPath('data.trace_id', $stored);
    expect(Bookmark::query()->pluck('trace_id')->all())->toBe([$stored]);

    $this->deleteJson("/trail/api/traces/{$sent}/bookmark")->assertOk()->assertJsonPath('data.trace_id', $stored);
    expect(Bookmark::query()->count())->toBe(0);
})->with([
    'a space' => ['a b', 'a%20b'],
    'a dot' => ['run.1', 'run.1'],
    'a plus' => ['a+b', 'a%2Bb'],
    'a long id' => [str_repeat('x', 64), str_repeat('x', 64)],
]);

it('answers an id that is too long or cannot be text with a 404, without a query', function (string $sent) {
    $queries = 0;
    DB::listen(function () use (&$queries) {
        $queries++;
    });

    $this->putJson("/trail/api/traces/{$sent}/bookmark")->assertNotFound()->assertJsonStructure(['message']);
    $this->deleteJson("/trail/api/traces/{$sent}/bookmark")->assertNotFound()->assertJsonStructure(['message']);

    expect($queries)->toBe(0);
})->with([
    'too long' => [str_repeat('x', 65)],
    'a null byte' => ['a%00b'],
]);

// The framework checks CSRF tokens everywhere but in the "testing" environment.
it('refuses a write without a CSRF token', function (string $method) {
    $this->app['env'] = 'local';
    $id = bookmarkable();
    $held = $method === 'DELETE' ? Rows::bookmark(Trace::query()->findOrFail($id)) : null;

    $this->withSession(['_token' => 'secret'])->json($method, "/trail/api/traces/{$id}/bookmark")->assertStatus(419)->assertJsonStructure(['message']);
    $this->withSession(['_token' => 'secret'])->json($method, "/trail/api/traces/{$id}/bookmark", [], ['X-CSRF-TOKEN' => 'wrong'])->assertStatus(419);

    expect(Bookmark::query()->count())->toBe($held === null ? 0 : 1);
})->with(['PUT', 'DELETE']);

it('lets a write with the session token through', function () {
    $this->app['env'] = 'local';
    $id = bookmarkable();
    $headers = ['X-CSRF-TOKEN' => 'secret'];

    $this->withSession(['_token' => 'secret'])->putJson("/trail/api/traces/{$id}/bookmark", [], $headers)->assertOk()->assertJsonPath('data.bookmarked', true);
    expect(Bookmark::query()->count())->toBe(1);

    $this->withSession(['_token' => 'secret'])->deleteJson("/trail/api/traces/{$id}/bookmark", [], $headers)->assertOk()->assertJsonPath('data.bookmarked', false);
    expect(Bookmark::query()->count())->toBe(0);
});

it('still reads without a CSRF token', function () {
    $this->app['env'] = 'local';

    $this->withSession(['_token' => 'secret'])->getJson('/trail/api/meta')->assertOk();
});

it('refuses an id that is not UTF-8 before the database is reached', function (string $method) {
    $queries = 0;
    DB::listen(function () use (&$queries) {
        $queries++;
    });

    // The framework refuses a malformed path itself, with a 400, so no run is looked up.
    $this->json($method, '/trail/api/traces/%FF/bookmark')->assertStatus(400)->assertJsonStructure(['message']);

    expect($queries)->toBe(0);
})->with(['PUT', 'DELETE']);
