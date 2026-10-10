# Releasing Trail

1. Merge a `CHANGELOG.md` entry for the version: a heading `## vX.Y.Z`, optionally followed by
   ` - YYYY-MM-DD`, then the release notes. The heading must match the tag exactly and the entry
   must not be empty; any other heading shape is refused. `CHANGELOG.md` must exist on `main`
   before the first tag.
2. Wait until the `tests` and `install` workflow runs for the head of `main` are green.
3. Run `scripts/release/preflight.sh vX.Y.Z`, then run the `git tag … && git push …` command it
   prints, which tags the commit it checked.
4. Watch the `release` workflow (`gh run watch`, or the Actions tab).
5. Check that [the package page](https://packagist.org/packages/astrophp/trail) lists the version.

Tags are `vMAJOR.MINOR.PATCH`, optionally with `-alpha`, `-beta` or `-rc` and a number
(`v0.2.0-rc.1`); a suffixed tag becomes a GitHub pre-release. The preflight fetches `origin/main`
but creates no tag and pushes nothing; it waits for no workflow run (a run still in progress is
reported and it exits non-zero; set `PREFLIGHT_WAIT_SECONDS` to wait).

## When a job fails

Pushing the tag made it public. Never move or delete a pushed tag; fix the cause and release a new
patch version. Packagist fetches versions from the repository's tags, so it may list a tag even
when no GitHub release exists ([Packagist about](https://packagist.org/about)).

- **verify** failed (invalid tag, commit not on `main`, `tests` or `install` not green for that
  commit, committed `dist/` differing from a fresh build, missing or empty changelog entry): no
  GitHub release exists. Fix it on `main` and release the next patch version.
- **release** failed: read the message. A release or draft that already exists for the tag is
  never changed; resolve that by hand. If nothing was created, re-run the failed job.
- **packagist** failed: the GitHub release exists but Packagist does not list the version after
  20 minutes. Use the package page's manual update (see below); once it lists the version, nothing
  else is needed.

## One-time Packagist setup (repository owner)

Follow [Packagist about](https://packagist.org/about).

1. Log in to Packagist and submit `https://github.com/astrophp/trail` with the submit button. Do
   this before the first tag is pushed: until the package exists, its metadata endpoint
   (`https://repo.packagist.org/p2/astrophp/trail.json`) returns 404 and the `packagist` job fails.
2. Packagist describes the GitHub hook in the "How to update packages?" section of that page:
   log in through GitHub so Packagist sets the hook up, or add the webhook by hand.
3. Check the package list for a warning that a package is not automatically synced; the page
   suggests a manual account sync to retry the hook.
4. When a tag does not appear, trigger a manual update on the package page.

Trail has no version constant. The dashboard shows the version Composer installed.
