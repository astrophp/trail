# Cost

Trail shows an **estimated** cost for every step, run, agent and model. It is not billing. It is
the tokens a provider reported, multiplied by list prices Trail holds, and it can differ from what
your provider charges you. For the real figure, use your provider's invoice or usage page.

## How an estimate is made

Each step and embeddings call is priced by its own usage when it is recorded. A run's cost is the
sum of its priced steps.

- Prices are in US dollars per **one million tokens**, with up to four rates per model: `input`,
  `output`, `cache_read` and `cache_write`.
- Input tokens are the total sent, cached tokens included. Cache-read and cache-write tokens are
  parts of that total and are charged at their own rates instead of the input rate.
- Reasoning tokens are already inside the output tokens, so they are not charged again.
- A model with no `output` rate, such as an embedding model, is priced from its input alone.
- A rate of `0` is a real price, and gives a cost of `0`.

A step that reports 1,000 input tokens (200 of them cache reads) and 300 output tokens on
`claude-sonnet-5` is estimated at $0.00464: 800 uncached tokens at 2.00, 300 output tokens at 10.00
and 200 cache-read tokens at 0.20, each per million.

## When Trail cannot estimate

A cost is `null`, shown as **Unpriced**, and never free, when:

- the step reported usage but no input token count, or
- the model has no price (see below), or
- the model charges for output and no output count was reported, or
- the step used tokens of a kind whose rate is missing, for example cache-write tokens on a model
  whose entry has no `cache_write` rate.

A rate that is left out of an entry is unknown, not free. Use `0` for something that really costs
nothing. A run with some priced and some unpriced steps shows its amount as **Partial**: the amount
covers only the steps that could be priced. See [What is recorded](recording.md#reading-the-dashboard).

## How a price is found

For the provider driver and model id of a step, Trail looks, in this order:

1. **A saved price** for exactly that provider and model: one you saved in the dashboard.
2. **The config entry** for exactly that id in `trail.pricing`.
3. **A prefix.** If the model id is a listed id followed by a version suffix, the listed id's
   rates apply. The suffix is `-latest`, a date (`-20251001`, `-2025-08-07`, `-08-2024`) or a short
   build number (`-001`, `-2512`). For example `gpt-5-2025-08-07` uses the rates of `gpt-5`. When
   several listed ids match, the longest wins. Both config entries and saved prices can be the id
   it goes through.
4. **Nothing.** Any other model is unpriced until you add it.

A saved price replaces the config entry as a whole: a rate you leave blank in it is unknown and
does not fall back to the config value.

### Adding a model

Add it to `trail.pricing` in your published `config/trail.php`, under its provider driver:

```php
'pricing' => [
    // ...the default prices stay here; add yours under the provider driver:
    'openai' => [
        'my-fine-tune' => ['input' => 3.00, 'output' => 12.00],
    ],
],
```

A `pricing` array you publish replaces the package's whole table, so keep the defaults in it and
add to them. Or skip the file: once a step with a new model has been recorded, the model appears
in the dashboard's price list, where you can set its price.

### The default prices

`config/trail.php` ships prices for 85 models across seven provider drivers (`anthropic`, `openai`,
`gemini`, `mistral`, `xai`, `groq`, `voyageai`). The file's own comment says what they are:

- They were read from each provider's pricing page on 2026-10-07 and are the standard, non-batch
  rates.
- They **do not model long-context surcharges.** Some OpenAI, Gemini and xAI models bill more above
  a prompt-size threshold, and Trail prices every token at the base rate.
- They do not model Anthropic's one-hour cache writes (the five-minute rate is used) or cache
  storage fees.
- The Gemini 3.6, 3.7 and 3.8 Flash rates are the provider's introductory prices, which the file
  notes the provider has announced will double on 2027-01-01.
- Many entries have no `cache_write` rate. A step that reports cache-write tokens on such a model
  is Unpriced.

Check them against your own agreements before you rely on a total.

## Editing prices in the dashboard

The Usage & cost page lists the models Trail knows: those in `trail.pricing`, those with a saved price, and
those a step or embedding was recorded with. For each, it shows the rates now in force and where
they come from (saved, config, or a prefix of another id). Models are not created there. Only a
model on that list can be given a price.

- **Save** a price to override the config value. Saved prices are stored in `trail_prices`, in
  your database. Leave a rate blank to mark it unknown.
- **Reset to config** removes a model's saved price, which returns it to the config entry or the prefix it resolves through.
- A saved price takes effect for runs recorded after it is saved. A process that is already
  running may take up to a minute to see it.

## A cost is frozen when it is recorded

The cost of a run is computed once, when the run is recorded, and stored. **Saving, resetting or
changing a price never changes a cost already recorded**, and nothing is repriced. If prices were
wrong for a week, that week's runs keep the wrong figures. This keeps history stable, and it means
that a model you price later leaves its earlier runs Unpriced.

The Usage & cost page also shows a spend projection. It carries the recent rate forward, priced at today's
prices, and is a projection, not a prediction and not a recorded cost. It is kept apart from the
recorded amounts and is not added to them.
