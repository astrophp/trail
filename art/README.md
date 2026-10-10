# art

The images of the README: the logo in a light and a dark variant, seven screenshots of the
dashboard, each in both themes, and the social preview. This directory is `export-ignore`d, so none
of it ships in the Composer package.

The README points at these files by absolute URL on `main`
(`https://raw.githubusercontent.com/astrophp/trail/main/art/<file>`), so they also render on
Packagist. A test (`tests/Feature/Docs/ArtTest.php`) checks that every file the README names is
here, that every image has alt text, that each screenshot has a light and a dark file, that nothing
here is unused, and that the screenshots are 2880 x 1800 pixels (1440 x 900 at 2x) and the social
preview 1280 x 640.

| File | What it shows |
| -- | -- |
| `logo-light.svg`, `logo-dark.svg` | The logo, for a light and a dark page |
| `overview-*.png` | Overview, last hour (the README's hero) |
| `traces-*.png` | The Traces list, last hour |
| `trace-*.png` | The inspector of a run with a tool call and a delegated sub-agent, with the tool call selected |
| `conversation-*.png` | A conversation of several turns |
| `agent-*.png` | The page of the agent with the most runs, last hour |
| `usage-*.png` | Usage & cost, last hour |
| `palette-*.png` | The command palette open over the Traces list, with a search that finds results in several groups |
| `social-preview.png` | The repository's social preview, 1280 x 640 |

## Retaking the screenshots

Every screenshot shows runs that Trail recorded from the workbench, never edited or drawn. Nothing is
seeded, no clock is faked and no row is backdated, so a chart has history only after the workbench
has been recording for a while.

You need PHP and Composer for the workbench, and for the screenshots Node 18 or newer, npm and
Google Chrome. Playwright is not a dependency of this repository: `scripts/art-shots.sh` installs
the version it pins into a cache directory outside the repository the first time it runs. To use
Playwright's own Chromium instead of Chrome, set `ART_BROWSER=chromium` and run
`npx playwright@1.64.0 install chromium` once.

1. In a clean checkout of the code you want to photograph, build the workbench database. It is
   empty until you record into it, and `composer build` never wipes an existing one:

   ```bash
   composer install
   composer build
   ```

2. Serve the workbench on a port that is free, and leave it running:

   ```bash
   php vendor/bin/testbench serve --port=8021
   ```

3. Record runs for about 70 minutes, in another terminal. The script runs a varied handful of
   workbench scenarios every two to four minutes (conversations, sub-agents, failures, failover,
   approvals, embeddings, unpriced and partly priced runs), offline, against scripted provider
   responses. No API key is needed or used. It reports a scenario that crashes by name and exits
   non-zero at the end; a scenario that fails on purpose is not a crash:

   ```bash
   scripts/art-record.sh 70
   ```

   Screenshots are taken on the **last hour** range, which draws five-minute buckets, so the
   activity and spend charts have about a dozen columns of real history. Take them while the
   recording is fresh: an hour after the script stops, the early runs have left the range.

4. **Stop the recorder** (it ends by itself when its minutes are up, or press Ctrl+C), then take
   every screenshot at once, in both themes, and the social preview:

   ```bash
   scripts/art-shots.sh http://localhost:8021
   ```

   It writes `art/<name>-light.png`, `art/<name>-dark.png` and `art/social-preview.png`. A light
   shot and its dark shot show the same page in the same state: the page is loaded once, shot,
   and shot again after the browser's colour scheme is switched. The script refuses to start while a
   run is in flight or one was recorded in the last 15 seconds, and fails when a page or the
   recorded data changed between the two shots. It finds what to open through the dashboard's own
   API (the conversation with the most turns, a run with a tool call and a delegated sub-agent,
   the busiest agent), so no run id is needed, and it looks only for what the screenshots you ask
   for need. When the workbench has recorded nothing suitable it stops and says what is missing:
   record longer and run it again. `--only overview,trace` retakes some, `--out <directory>`
   writes elsewhere and `--path` is the dashboard's path (`/trail` by default).

5. Look at every image before you commit it. The checklist: the page only, no scrollbar, no focus
   ring, no toast, no skeleton, no tooltip, a chart with real history and not two bars, and
   nothing personal or specific to your machine in view. Then compress them (see below), run
   `composer test` and commit.

The dark variants are the dashboard's own dark theme. The dashboard follows the browser's colour
scheme until a person picks a theme with its toggle (the toggle keeps the choice under
`trail-theme` in local storage), so the script switches the browser's colour scheme, as an
operating system does at dusk. No style is injected.

### Compression

Screenshots are saved by the browser as PNG. If `pngquant` is installed, a visually lossless pass
keeps them small:

```bash
pngquant --quality=85-98 --speed 1 --strip --ext .png --force art/*-light.png art/*-dark.png
```

## Social preview

`art/social-preview.png` is not referenced from the README. Upload it in the repository's settings,
under Social preview. `scripts/art-shots.sh` composes it from the logo and `overview-light.png`, so
retake the screenshots first when the dashboard has changed. It uses the dashboard's own colours and
type, read from the page.
