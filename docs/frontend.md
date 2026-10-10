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

## Building a list page

A list page (a table of rows the server sorts, filters and pages) is assembled from shared pieces.
Do not rewrite any of them in a feature.

- **`useListState(params, filterKeys)`** (`hooks`): the view in the URL. One params object per page,
  containing `page`. Everything that changes which rows are shown goes through `change`, and
  `clear` / `clearAll` put filters back to their `default`; `setPage` only moves the page.
- **`HistorySearchField`** (`patterns`): the search box. It commits after a pause, on Enter or on
  blur, and makes a typing session one history entry. `normalizeSearch` and `searchParam` are in
  `lib/search`, so the box and the API param agree on what a search is.
- **`toTableSort` / `toApiSort`** (`lib/table-sort`): the table's sort and the API's `sort` value,
  for the list of sorts the API takes.
- **`DataTable`** (`patterns`): draws the loading, refreshing and empty states, and provides
  `TableBusyContext` from its `busy` prop. A control in a cell that writes to the cache reads it
  and disables itself while the rows are the previous view's. A narrow column of one control (a
  row's bookmark) is pinned to the right edge with `meta.stickyEnd`, so it stays in view where the
  table scrolls sideways. Make the control fill the cell, padding included: the pinned cell sits
  above the row's link, so a click on its padding would otherwise do nothing.
- **`useListStatus`** (`hooks`): from the query, whether to draw `failed`, `loading` or `empty`, and
  the move off a page past the end.

Two guarantees come with these pieces; keep them when adding a list:

- A filter or sort change returns to page 1 in the **same history entry**, so Back never lands on a
  page number that meant something else.
- **Placeholder data is the previous view's answer.** `useListStatus` reports `loading` when there
  is no data, for a page past the end and for an *empty* placeholder, so "empty" is never read from
  it. Rows from a placeholder are the previous view's rows: `DataTable` draws them `busy` (dimmed).
  Any count, total or page number shown outside the dimmed table must also check the query's
  `isPlaceholderData`; `loading` being false does not make a count current.

## The command palette

⌘K / Ctrl K opens a palette from any page: go to a page, run a small action, or find a run, a
conversation or an agent. The shell mounts it once (`PaletteProvider` and `PaletteTrigger` from
`@/features/palette`); the dialog itself is the `CommandPalette` pattern, which knows nothing of Trail.
What goes into it, and how:

- **A page** is an entry of `lib/nav-pages`, the one list the sidebar, the route table and the palette
  read. A page that is not in the navigation is not offered.
- **An action** is an item of `ActionGroup` in the palette feature. Only what needs no confirmation
  and already exists elsewhere in the dashboard (the theme, copying a link); reuse its code, do not
  copy it.
- **A result** comes from `GET /api/search` and is a group in `search-groups.tsx`: a real link (its
  address built with the path helpers, never by hand), built from the `telemetry` components, so a
  missing value reads `Not captured` or `Sub-agent only` and is never formatted or zero. A group the
  API cut ends with the list that holds the rest, written with that list's own link helper.
- **Never the answer to another text.** The search is keyed by its text and range, keeps no
  placeholder data, shows loading while the text waits out its pause or its request is out, and
  aborts the request of a text that was replaced. Do not add `placeholderData` to it.
- The palette is not navigation: opening it changes no URL and remounts no page, so a page must not
  rely on losing focus or state when it opens. The key is handled by one hook
  (`usePaletteShortcut`), the one shortcut that also works while typing in a field.

## The catalogue

`npm run catalogue` serves a dev-only page of every shared component in its variants and states, in
both themes. It is a separate Vite entry, so none of it reaches `dist/`.

A component in `patterns` or `telemetry` has a `name.catalogue.tsx` next to it, which the catalogue
picks up by itself; see `components/ui/button.catalogue.tsx` for the shape. Enforced: a test fails
when a shared component has no catalogue file. For `ui` primitives an entry is optional.
