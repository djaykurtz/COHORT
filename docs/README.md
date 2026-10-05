# ZeroBrain portfolio showcase

This directory is a static GitHub Pages site. Visitors need no backend, account,
environment secrets, or runtime package installation.
The project address is `https://djaykurtz.github.io/COHORT/`.

## Preview

From the repository root:

```powershell
python -m http.server 8433 --bind 127.0.0.1 --directory docs
```

Open `http://127.0.0.1:8433/`. The project story uses movement-style progressive
disclosure. **Explore ZeroBrain** opens the functional demo.

The demo supports work filtering, task/role/design drilldowns, local status/owner
simulation, reset, a deadline-pressure review table, domain filters, expandable
knowledge notes, synthetic health-state exploration and a research/decision inspector.
The [system atlas](systems/) starts with an invented work/failure story and maps the
documented/exported boundaries, aliases, authority, handoffs, availability and exact
evidence. It does not enumerate unseen private runtime components or recreate absent
database-backed records.
All fixture identities, tasks, proposals, timestamps and counts are invented.
Interactions affect memory only; reset/reload discards changes.
No assignment, claim, review, authorization, upload, agent launch or real probe is performed.

## Implementation boundary

`scripts\build-showcase.cjs` selects rendering-only functions from the preserved
application's Components, Nodes, TaskBoard and ReviewPipeline modules. It also copies
their CSS without the external font import. Generated assets are committed under
`demo\ui` so Pages can serve them directly.

```powershell
node scripts\build-showcase.cjs
node scripts\build-showcase.cjs --check
node scripts\build-atlas.cjs
node scripts\build-atlas.cjs --check
```

The sample adapter and fixtures are separate from the original application.
It loads no API client, streaming client, service worker, storage layer, operator
console or image service. The generator rejects operational APIs in selected functions,
and the page's Content Security Policy blocks network connections and workers.
Browser checks additionally verify that no API/external requests or persistent
storage are used during interaction.

The research inspector also reuses the original Cairn stage order, legacy-stage
normalizer and wave badge. Its invented-record filter is not Spyglass FTS5. Its
local team-input and decision walkthrough runs entirely in the browser and checks
nothing on a server. It shows only the usual route, where the operator approves the
design once the team's input is in; the other routes are described but not run.

The atlas is generated from `systems\catalog.json`, with semantic HTML disclosures
and a textual diagram fallback that remain available without JavaScript.
Laptop checks measure effective rendered sizes at 100% zoom on 1280x720, 1366x768
and 1440x900; prose is 18px+, essential controls/labels 16px+, with responsive reflow
rather than whole-page scaling. Full-resolution illustration links accompany screenshots.

The public demo intentionally does not expose the reference application's real
message, file, credential, authorization or recovery controls. Its design/knowledge
and health layers illustrate documented contracts, not a connected implementation.

## Browser checks and screenshots

Requires Node.js, the existing dashboard dev dependencies, and Chromium/Edge:

```powershell
Set-Location cohort\zerobrain\superdash
npm ci
# Optional on Windows when Edge is installed:
$env:SHOWCASE_BROWSER_PATH = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
npm run test:showcase
```

The dedicated configuration starts a loopback-only static server on port 8497 and
checks both the root and `/COHORT/` project-prefix routing. It saves reproducible
desktop screenshots under `docs\assets`. These show synthetic views, not operational
measurements. Test output is ignored.

## Hosting

The [Pages workflow](../.github/workflows/pages.yml) runs on pushes to `main` and
manual dispatch. It verifies generated assets and uploads **only this `docs` directory**.
The build job has read-only repository access; only the deploy job receives Pages
and identity-token write permission, scoped to the `github-pages` environment.
No personal credentials or application secrets are configured in the workflow.

Pages must use **GitHub Actions** as its deployment source. A `.nojekyll` file ensures
the site is served as authored. All local assets and navigation use relative URLs for
the `/COHORT/` project prefix. Do not host `cohort\zerobrain\superdash` as the public site.
