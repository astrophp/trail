# Payloads and sampling

A payload is the content of a run: the prompt, the messages, the instructions, the arguments and
results of tools, and the model's output. Trail stores payloads so you can see what happened in a
run. This page covers what it stores, what it removes first, and how to record fewer runs.

A value passes through three stages before it is stored, in this order:

1. It is turned into plain, JSON-safe data.
2. Secrets are redacted.
3. Strings are cut to `capture.max_length`.

Redaction runs before the cut, so a secret cut in half cannot slip past a pattern.

## Turning payload capture off

<!-- sample: payloads.capture-off -->
```php
'capture' => [
    'enabled' => false,
],
```

With `capture.enabled` set to `false`, Trail stores no input, output or excerpt, and not the
arguments of a pending approval. Runs, steps, timings, usage, cost and error classes are still
recorded. Exception messages are kept, redacted and truncated like any other text, because they
describe a failure rather than content.

`capture.system_prompt` set to `false` stops Trail reading the agent's instructions. Trail calls
`instructions()` once per run to store them, in addition to the SDK's own calls; this stops that
extra call.

## Redaction

Redaction is on by default (`redaction.enabled`). A redacted value is replaced with `[redacted]`.

**Keys.** A value under one of the `redaction.keys` is replaced as a whole, at any depth of an
array. The defaults are listed in [Configuration](configuration.md#redaction-keys).

- Keys are compared ignoring case, dashes, underscores and spaces.
- An entry matches the key exactly: `token` does not match `input_tokens`.
- An entry that starts with `*` matches any key that ends in the rest: `*password` covers
  `password`, `db_password` and `DB-PASSWORD`. A `*` is only allowed as the first character.
- The same keys also redact the value in the quoted forms inside any text, such as
  `{"password":"hunter2"}` or `'password': 'hunter2'`, and the same with escaped quotes. Only that
  value is replaced.

**Patterns.** Every string, and every array key, is also scrubbed with `redaction.patterns`:
regular expressions whose matches are replaced. The defaults cover bearer tokens, HTTP Basic
credentials, the password in a URL, common provider API keys, AWS keys, JSON web tokens and private
key blocks. They are kept narrow so ordinary text is left alone.

**Adding your own.** A list you set replaces the default list; it does not extend it. To add to the
defaults, keep them in your published `config/trail.php` and add yours at the end:

<!-- sample: payloads.redaction -->
```php
'keys' => [
    // ...the default keys, then yours:
    'ssn',
],

'patterns' => [
    // ...the default patterns, then yours:
    '/\bACME-[0-9]{8}\b/',
],
```

An empty list means none. A list that holds something other than strings has those entries
skipped and reported; a setting that is not a list at all is reported and the defaults apply.

**Writing patterns.** Keep your own patterns linear: avoid nested quantifiers and an unbounded
lookahead from a repeatable start. A pattern that is not valid is reported once, with the reason,
and skipped. A string a pattern cannot be run on is replaced as a whole. Only the first
`capture.max_length` characters of a string plus a few thousand more are scanned, because nothing
past that is stored.

**What redaction cannot find.** A secret in free text with no recognisable shape, such as a
password written in a sentence, is not redacted. Redaction narrows what is stored. It is not a
promise that nothing sensitive is stored, and anyone who can open the dashboard can read what is
([Access](access.md)). If prompts can hold data you must not keep, turn payload capture off or
filter those runs out.

## Truncation

`capture.max_length` (default `10000`) is the longest any single string is kept, in characters.
Longer strings are cut and the span is marked truncated. `null` means no limit; zero and negative
values are not limits and use the default. Together, the strings of one captured field are kept to
100 times this length, and what is past that is dropped.

## Sampling

`trail.sampling` (`TRAIL_SAMPLING`, default `1.0`) is the share of top-level runs Trail records,
from `0` (none) to `1` (all). The draw is random, so `0.25` records about a quarter of the runs,
not every fourth.

- The decision is made when a run starts. A sub-agent or an embeddings call inside a run follows
  that run, and a sampled-out run that later fails is not recorded either.
- A value that is not a number is reported and treated as `1`.

## Choosing runs in code: `Trail::filter()`

`Trail::filter(?Closure $callback): void` decides per run. The callback receives a
`Astro\Trail\RecordingCandidate` when a top-level run starts. Return `false` to skip the run and
everything under it. Any other return value records it.

<!-- sample: payloads.filter -->
```php
use Astro\Trail\Facades\Trail;
use Astro\Trail\RecordingCandidate;

Trail::filter(function (RecordingCandidate $run) {
    // Do not record the health-check agent.
    return $run->agentClass !== App\Ai\Agents\HealthCheckAgent::class;
});
```

A `RecordingCandidate` has these public properties:

| Property | Holds |
| -- | -- |
| `type` | `Astro\Trail\Enums\SpanType::Agent` for an agent run, `SpanType::Embedding` for an embeddings call made on its own |
| `agentClass` | The agent's class, or `null` for an anonymous agent and for embeddings |
| `agent` | The agent instance, or `null` for embeddings |
| `prompt` | The prompt text, or `null` for embeddings |
| `userId`, `userType` | The user of the conversation, when the agent remembers conversations and has one |
| `provider` | The provider's driver name, not the name of its connection |
| `model` | The model |

- The prompt is the text exactly as your application gave it, before redaction. What the filter is
  shown is not stored.
- A filter that throws is reported, and the run is recorded.
- Runs the filter itself starts are not recorded.
- `Trail::filter(null)` removes the filter.
- The filter is kept in the process. Set it once, in a service provider's `boot()` method.

The filter is asked before the sampling rate is applied.

## Leaving a block of code out: `Trail::withoutRecording()`

`Trail::withoutRecording(Closure $callback): mixed` runs the callback and returns what it
returns. Nothing that starts inside it is recorded.

<!-- sample: payloads.without -->
```php
use Astro\Trail\Facades\Trail;

$answer = Trail::withoutRecording(function () {
    return (new App\Ai\Agents\SupportAgent)->prompt('Summarise this ticket')->text;
});
```

- This covers runs, and also a sub-agent or an embeddings call made under a run that is being
  recorded. The tool that made the call is recorded, because it started outside.
- What starts inside stays unrecorded even if it ends after the callback. Runs already in progress
  are not affected.
- Calls nest.
- The setting is kept for the whole process, not for one call stack. A Fiber that is suspended
  inside the callback leaves recording off for other code until it resumes.

## Pausing everywhere

`php artisan trail:pause` stops recording in every process, without a deploy, until
`php artisan trail:resume`. See [Operations](operations.md#pausing-and-resuming).
