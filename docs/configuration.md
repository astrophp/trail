# Configuration

Trail's configuration lives in `config/trail.php`. You do not need to publish it to use Trail:
without a published file the package's own defaults apply. To change a value that has no
environment variable, publish the file with `php artisan trail:install` (see
[Installation](installation.md)) or `php artisan vendor:publish --tag=trail-config`.

This page lists every key in the order the file has them. The default is what applies when you
set nothing. A key with an environment variable can be set in `.env` without publishing anything.

- The file is merged into your application's configuration one level deep. A top-level key you
  publish (`capture`, `redaction`, `dashboard`, `storage`) replaces the package's whole section,
  so a key added to that section by a later version of Trail is not filled in from the package.
  After an upgrade, compare your published file with the package's.
- With a cached configuration (`php artisan config:cache`) the file is read once when the cache is
  built. Rebuild it after you change a value or an environment variable.

## Keys

| Key | Environment variable | Default | What it does |
| -- | -- | -- | -- |
| `enabled` | `TRAIL_ENABLED` | `true` | The master switch. When `false`, Trail records nothing and registers no dashboard routes. Its artisan commands stay available. |
| `dashboard.enabled` | `TRAIL_DASHBOARD_ENABLED` | `true` | When `false`, Trail registers no dashboard routes, so the dashboard's address answers 404, and it keeps recording. |
| `path` | `TRAIL_PATH` | `'trail'` | Where the dashboard is served. Slashes around it are ignored, and an empty path means `trail`: the dashboard is never served from the root of your application. |
| `domain` | `TRAIL_DOMAIN` | `null` | Serve the dashboard on one domain only. `null` (or an empty string) serves it on every domain your application answers. |
| `middleware` | none | `['web']` | The middleware every dashboard request passes through. Trail's own access check is always added after these. |
| `guard` | `TRAIL_GUARD` | `null` | The authentication guard whose user is checked against the `viewTrail` gate. `null` uses your application's default guard. |
| `storage.connection` | `TRAIL_DB_CONNECTION` | `null` | The database connection Trail's tables live on, for migrations, writes and reads. `null` uses your application's default connection. |
| `retention` | none | `14` | Days to keep traces. `trail:prune` deletes older ones. It must be a positive number: anything else and the command deletes nothing. |
| `sampling` | `TRAIL_SAMPLING` | `1.0` | The share of top-level runs recorded, from `0` (none) to `1` (all). A value that is not a number is reported and treated as `1`. |
| `capture.enabled` | none | `true` | When `false`, no prompt, message, tool argument, result or model output is stored. Runs, steps, timings, usage, cost and error classes still are. |
| `capture.system_prompt` | none | `true` | Whether the agent's instructions are read and stored. Trail calls `instructions()` once per run for this, in addition to the SDK's own calls. |
| `capture.max_length` | none | `10000` | The longest any single string is kept, in characters. `null` means no limit. Zero and negative values are not limits and use the default. |
| `redaction.enabled` | none | `true` | Whether secrets are removed from what is stored. |
| `redaction.keys` | none | 15 entries, listed [below](#redaction-keys) | Keys whose value is replaced as a whole. A list you set replaces the defaults. |
| `redaction.patterns` | none | 22 patterns | Regular expressions whose matches are replaced inside any string. A list you set replaces the defaults. |
| `stale_after` | none | `3600` | Seconds after which a run still marked running is treated as abandoned and shown as Incomplete. Values below 60 behave as 60. |
| `pricing` | none | 85 models across 7 providers, see [Cost](cost.md) | List prices in USD per million tokens, by provider driver and model id. |

### Notes on single keys

- **`enabled`** turns Trail off for the whole process: no listener is registered and no route is
  added. To stop recording without a deploy and keep everything else, use `php artisan trail:pause`
  ([Operations](operations.md)).
- **`path` and `domain`** are fixed when the route cache is built (`php artisan route:cache`).
- **`middleware`**: a request that fails Trail's access check gets a 403 and is never redirected
  to a login page. To send guests to one, add your own `auth` middleware to this list. See
  [Access](access.md).
- **`storage.connection`** applies to every Trail table and to the migrations, so set it before you
  run `php artisan migrate`. The migrations create the tables on this connection. See
  [Storage](operations.md#storage).
- **`retention`**: nothing runs `trail:prune` unless you schedule it.
- **`sampling`** is decided once, when a top-level run starts. A sub-agent or an embeddings call
  inside a run follows that run, and a sampled-out run that later fails is not recorded either.
  The environment variable arrives as text, and a numeric string such as `0.25` is accepted. See
  [Payloads and sampling](payloads.md#sampling).
- **`capture.max_length`**: longer strings are cut and the span is marked truncated. Together, the
  strings of one captured field are kept to 100 times this length; what is past that is dropped. A
  number read from an environment variable as text is accepted.
- **`stale_after`** should be above the longest run you expect. `trail:sweep` writes the Incomplete
  status to the database; until it runs, the dashboard already shows it.

### Redaction keys

The default `redaction.keys`:

<!-- redaction-keys:start -->
`*password`, `*passwd`, `*pwd`, `*passphrase`, `*password_confirmation`, `*secret`, `*secret_key`,
`*secret_access_key`, `*access_key`, `*api_key`, `*private_key`, `*token`, `*authorization`,
`*cookie`, `credentials`
<!-- redaction-keys:end -->

How these and the patterns are matched is described in [Payloads and sampling](payloads.md#redaction).

### The default patterns and prices

`redaction.patterns` and `pricing` are long lists, so this page does not copy them. They are the
values in the package's `config/trail.php`, which is the one place they are written down. The
number of patterns and the number of models above are checked against that file by Trail's tests,
and so is every other default on this page.

## Environment variables

```dotenv
TRAIL_ENABLED=true
TRAIL_DASHBOARD_ENABLED=true
TRAIL_PATH=trail
TRAIL_SAMPLING=1.0
```

`TRAIL_DOMAIN`, `TRAIL_GUARD` and `TRAIL_DB_CONNECTION` take a name, for example
`TRAIL_DOMAIN=ai.example.com`; leave them out to keep the defaults.
