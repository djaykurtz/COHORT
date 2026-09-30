# Superdash deployment discipline

Changing a repository is not proof that the operator received the new dashboard.
This reference tooling separates repository state, delivered asset bytes, and verified deployment.
It is optional integration tooling for a newly configured Git deployment, not a Pages prerequisite.

## Reconcile before changing a deployed worktree

Use `scripts\superdash-deploy-reconcile.ps1` with your own `-DeployTree`, `-Remote`,
and `-Branch`. It compares the local branch and the selected remote-tracking branch.
Fetching is opt-in with `-Fetch`; do not run it against an unintended remote.

`CONVERGENT` exits zero. `AHEAD`, `BEHIND`, and `DIVERGENT` require reconciliation
and exit nonzero. Missing refs or Git failures are errors, not convergence.

## Commit before deployment

In a Git-managed deployment, make changes in a development checkout and promote reviewed
commits to the deployed worktree. Manual edits to live files create a mismatch between
source provenance and served bytes. Git-based tools operate on the new repository's
history; this snapshot carries none.

## Verify cache stamps

The server treats versioned JavaScript/CSS URLs as immutable. A content change must therefore
change its URL stamp. `scripts\Lint-CacheStamps.ps1` compares asset content hashes against
`.cache-stamp-manifest.json`.

```powershell
scripts\Lint-CacheStamps.ps1 -Init
scripts\Lint-CacheStamps.ps1 -Check
```

Initialize the baseline only for a known deployment state. `-Check` does not establish a
missing baseline; it fails explicitly. `-Bump` updates changed stamps and the manifest.
The manifest contains file-content SHA256 values, not source commit history.

## Record deployment, not just a push

After checking the actual served UI, `scripts\superdash-deploy-receipt.ps1` can create a local
receipt with the new commit, verifier, time, and selected remote tip. A receipt is not a
substitute for verification. The script requires PowerShell 7 for its isolated cache gate.
Remote fetching is opt-in with `-FetchRemote`; configure `-Remote` and `-Branch` for your site.

Receipts are runtime evidence and ignored in this portfolio by default. Do not publish
site-specific identities, notes, infrastructure details, or secrets in receipt files.
