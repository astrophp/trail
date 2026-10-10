# Access

The dashboard is served from your application, by default at `/trail`. Who may open it is decided
on every request, for the page and for the JSON API behind it.

## The default check

- In the `local` environment (`APP_ENV=local`) anyone can open the dashboard, signed in or not.
- In any other environment the request must pass the `viewTrail` gate. The user is the one the
  configured [guard](#the-guard) resolves. Until you say who may pass, nobody does.
- A guest is denied, unless your gate accepts a missing user. Laravel does not call a gate callback
  whose first parameter cannot be `null` for a guest.
- If no `viewTrail` gate is defined at all, everybody is denied.
- A request that fails the check gets a **403**. It is never redirected, so Trail never sends
  anyone to a login page. Dashboard API paths answer the same way, as JSON.

## Defining who can open it

`php artisan trail:install` publishes `App\Providers\TrailServiceProvider` and registers it in
`bootstrap/providers.php` (see [Installation](installation.md)). It defines the gate in a method
you edit:

<!-- sample: access.gate -->
```php
use Illuminate\Support\Facades\Gate;

protected function gate(): void
{
    Gate::define('viewTrail', function ($user) {
        return in_array($user->email, [
            'ada@example.com',
        ]);
    });
}
```

The provider Trail ships (`Astro\Trail\TrailApplicationServiceProvider`) defines a gate that
denies everyone, so a gate you forget to fill in fails closed.

## Your own check instead of the gate

To decide with your own code, override `authorization()` in the same provider and call
`Trail::auth()`:

<!-- sample: access.auth -->
```php
use Astro\Trail\Facades\Trail;

protected function authorization(): void
{
    Trail::auth(fn ($request) => $request->user()?->is_admin === true);
}
```

- The callback receives the `Illuminate\Http\Request` and grants access only by returning exactly
  `true`. Any other return value, truthy ones included, denies.
- It replaces the default check entirely, so it also applies in the `local` environment.
- `Trail::auth(null)` goes back to the default check.

## The guard

`trail.guard` (`TRAIL_GUARD`) names the authentication guard whose user is checked. `null`, or an
empty value, uses your application's default guard. The guard only chooses who the user is. The
user still has to pass the gate, or your `Trail::auth()` callback has to accept the request.

## Middleware

`trail.middleware` is the list of middleware every dashboard request passes through; it defaults to
`['web']`. Trail's own access check is not in this list. It is always added after it, so editing the
list can never remove the check.

Because a failed check is a 403 and not a redirect, a guest never reaches a login page. To send
guests to one, add your own `auth` middleware to the list, for example `['web', 'auth']`.

## Path and domain

- `trail.path` (`TRAIL_PATH`, default `trail`): the dashboard answers every address under this
  path. It is never served from the root of your application.
- `trail.domain` (`TRAIL_DOMAIN`, default `null`): serve the dashboard on one domain only.

With cached routes (`php artisan route:cache`) both are fixed when the cache is built.

## The two switches

| Setting | Effect |
| -- | -- |
| `TRAIL_DASHBOARD_ENABLED=false` | No dashboard routes: its address answers 404. Trail keeps recording. |
| `TRAIL_ENABLED=false` | Trail records nothing and registers no dashboard routes. Its artisan commands stay available. |

Both are also checked on every request, so with cached routes a request still answers 404 once the
switch is off.

## What the dashboard can change

The dashboard is read-only except for two things: it can bookmark a run, and it can save or reset
the price of a model ([Cost](cost.md)). It cannot edit or delete recorded runs. Deleting is what
`trail:prune` and `trail:clear` do ([Operations](operations.md)).

Anyone who can open the dashboard can read every stored prompt, message and tool result that
redaction did not remove ([Payloads and sampling](payloads.md)), and can download the CSV exports
of runs and usage. The runs export holds prompt and response excerpts and each run's user id,
type, name and email. Give access accordingly.
