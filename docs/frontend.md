# Frontend architecture

The dashboard is a React + TypeScript app in `resources/js`, built by Vite into `dist/app.js` and
`dist/app.css`, which the Blade layout inlines into every page. This page is the whole rulebook.
`npm run lint` and `npm test` enforce it; where a rule is enforced, the rule says how.

## Layers

Code lives in layers. A file may import only from layers **below** its own.

```
resources/js/
  main.tsx              the entry: mounts the app
  app/                  router, providers and the shell (sidebar, top bar). Wiring only.
  pages/                one component per route. The only place features are combined.
  features/<area>/      everything specific to one area: its components, queries, view logic.
  components/
    telemetry/          Trail's vocabulary, used by every feature: status, cost, tokens, duration, ids.
    patterns/           composed building blocks with no Trail knowledge: page header, data table, states.
    ui/                 shadcn/ui primitives, vendored by the shadcn CLI.
  api/                  the HTTP client, endpoint functions and response types. No React.
  hooks/                React hooks that belong to no feature.
  lib/                  plain modules with no React: helpers, the boot object, cn().

  catalogue/            dev-only component catalogue (its own Vite entry, never in the bundle)
  test/                 test setup and helpers
```

A layer folder is created when its first file is; there are no empty placeholders.

Three rules tighten "only downwards":

- **A feature never imports another feature.** What two features need moves down: to `patterns`
  if it would make sense in another application, to `telemetry` if it speaks Trail's vocabulary.
  Two features on one screen are combined by a page.
- **A feature is used through its `index.ts`.** Pages and the app import `@/features/traces`, never a
  file inside it. What `index.ts` does not export is private to the feature.
- **Pages do not import `api/`.** Data reaches a page through a feature.

Inside `components/`, `telemetry` may use `patterns` and `ui`, `patterns` may use `ui`, and `ui`
uses only `hooks` and `lib`. `api` and `hooks` may use `lib`; `lib` imports nothing of ours.

Enforced by `eslint-plugin-boundaries`: every source file under `resources/js` must belong to a
layer, and an import that points upwards, sideways into another feature, or from a page or the app
past a feature's `index.ts` fails `npm run lint`. Test and catalogue files may import anything, and
nothing imports them.

## Where things go

- **Start from shadcn/ui.** Before building anything, look for a shadcn component or block that
  does it, add it with `npx shadcn@latest add <name>`, and compose it. Never write a primitive
  shadcn provides. Files in `components/ui` stay as the CLI wrote them: restyle through tokens and
  `className`, not by editing them. If one must change, say why in the commit.
- **Shared on second use.** Build a component in the feature that first needs it. The second time
  it is needed elsewhere, move it down to `patterns` or `telemetry`. Never copy a look-alike.
- **A page is a short composition of named parts.** It reads URL state, places feature components,
  and sets the page title. Past about 150 lines, something belongs in a feature. Enforced: `max-lines`
  on `pages/`.

## Components

- One component per file. Files are `kebab-case.tsx` and export by name; there are no default
  exports. Enforced by lint.
- Tests sit next to the file as `name.test.tsx`.
- Composition over configuration: prefer children and small parts over props that switch behaviour.
  Variants go through `cva`. Every component accepts `className`. Anything stateful is controlled by
  default.
- Import across folders with `@/…`. A relative import never climbs: no `../`. Enforced by lint.

## State

- Server state lives in the query cache, view state (filters, selection, tabs) in the URL, and
  short-lived UI state in the component. A feature owns the queries for its own data.
- There is no global client state library. Enforced: importing one fails lint.

## Styling

- Tokens and Tailwind utilities only. Colours, radii, shadows and fonts are theme variables in
  `resources/js/index.css`. Enforced outside `components/ui`: a hex colour or an arbitrary
  pixel value such as `w-[212px]` in a class name fails lint.
- Both themes come from the `dark` class on `<html>`; never branch on the theme in a component.

## Missing values

A value Trail did not capture is `null`, and is shown as `Not captured`, `Pending`, `Unpriced` or
`Incomplete`, never as zero. Only the `telemetry` components format such values; nothing else
formats a cost, a token count or a duration by hand.

## The catalogue

`npm run catalogue` serves a dev-only page of every shared component in its variants and states, in
both themes. It is a separate Vite entry, so none of it reaches `dist/`.

A component in `patterns` or `telemetry` has a `name.catalogue.tsx` next to it, which the catalogue
picks up by itself; see `components/ui/button.catalogue.tsx` for the shape. Enforced: a test fails
when a shared component has no catalogue file. For `ui` primitives an entry is optional.
