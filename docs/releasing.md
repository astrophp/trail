# Releasing Trail

1. Merge a changelog entry for `vX.Y.Z`.
2. Confirm `main` is green.
3. Run `scripts/release/preflight.sh vX.Y.Z`, then create `vX.Y.Z` on `main`'s head and push the tag.
4. Watch the `release` workflow.
5. Check that Packagist lists the version.

The workflow refuses malformed tags, commits outside `main`, missing or unsuccessful `tests` or
`install` runs, stale compiled assets, and missing or empty changelog notes. Fix a failed release
with a new patch version; never move or delete a published tag.

If `verify` fails, no GitHub release was published: fix the problem on `main` and release a new
patch version. The pushed tag is already public; Packagist fetches versions from VCS tags, not
GitHub releases, so it may still list that tag. If `release` fails, no GitHub release was created.
If `packagist` fails, the GitHub release exists but Packagist does not list the version yet; use
the Update button or re-sync the GitHub connection as described below.

## One-time Packagist setup

1. Sign in to packagist.org with the GitHub account that owns the repository.
2. Submit `https://github.com/astrophp/trail` on Packagist.
3. Check for the automatic-sync warning in the Packagist package list and the Packagist webhook
   in the repository's Settings → Webhooks
   (Packagist's documentation does not name that GitHub settings path).
4. If a tag does not appear, use the package page's **Update** button, or re-sync the GitHub
   connection from the Packagist profile.

These steps follow Packagist's [about documentation](https://packagist.org/about), which says tags
are fetched automatically and describes GitHub hook setup and manual package updates.

Trail has no version constant. The dashboard shows the version Composer installed.
