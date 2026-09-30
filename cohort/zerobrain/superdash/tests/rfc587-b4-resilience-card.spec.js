// @ts-check
// RFC587-B4 -- Resilience Card Playwright spec (mock + LIVE)
//
// Tests the canonical get_resilience_incidents response shape.
//
// Canonical shape under test:
//   {
//     incidents: [{ incident_id, node_id, phase, started_at,
//                   severity, root_cause_class?, ended_at? }],
//     nodes: { <node_id>: { current_phase, phases_observed[] } },
//     truncated: bool
//   }
// severity ∈ {RED, YELLOW, GREEN}; phase ∈ B4_PHASE_VOCAB (10 tokens).
//
// LIVE mode (set LIVE=1 env var): hits real :8430 endpoint with real auth.
// Mock mode (default): page.route() mocks the fetch -- no backend dep.
//
// AC coverage (8 ACs):
//   B4.card-hidden     card hidden when flag OFF (default)
//   B4.card-visible    card visible + renders rows when flag ON + payload returned
//   B4.dot-red         dot=red when ≥1 RED-severity incident in payload
//   B4.dot-yellow      dot=yellow when only YELLOW severities present
//   B4.dot-green       dot=green when only GREEN (or no incidents)
//   B4.truncated       truncated indicator shows when payload.truncated=true
//   B4.error           error banner + retry button on HTTP non-200
//   B4.live-shape      (LIVE only) real /api/resilience_incidents returns valid shape

const { test, expect } = require('@playwright/test');

const URL = 'http://localhost:8430/';
const LIVE = process.env.LIVE === '1';

// ── Mock-payload builders against canonical shape ───────────────────────────
function buildPayload(opts = {}) {
  const incidents = opts.incidents || [];
  const nodes = opts.nodes || {};
  return {
    incidents,
    nodes,
    truncated: !!opts.truncated,
  };
}

function incidentRow(node, phase, severity, startedAt) {
  return {
    incident_id: node + ':' + phase + ':' + (startedAt || '2026-06-13T00:00:00Z'),
    node_id: node,
    phase,
    started_at: startedAt || '2026-06-13T00:00:00Z',
    severity,
  };
}

function nodeRollup(currentPhase, observed) {
  return { current_phase: currentPhase, phases_observed: observed || [currentPhase] };
}

async function setupFlag(page) {
  await page.addInitScript(() => {
    try { localStorage.setItem('resilienceCard', '1'); } catch (e) { /* noop */ }
    window.RESILIENCE_CARD_ENABLED = true;
  });
}

async function setupMock(page, payload, status = 200) {
  await setupFlag(page);
  await page.route('**/api/resilience_incidents**', async (route) => {
    if (status !== 200) {
      await route.fulfill({
        status, contentType: 'application/json',
        body: JSON.stringify({ error: 'mock failure' }),
      });
      return;
    }
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify(payload),
    });
  });
}

async function waitForCardSettled(page) {
  await page.waitForSelector('#resilience-card', { timeout: 5000 });
  // Loading dot replaced once _render runs post-fetch (success or error)
  await page.waitForFunction(() => {
    const dot = document.getElementById('resilience-card-dot');
    if (!dot) return false;
    return !dot.classList.contains('resilience-card-dot--loading');
  }, { timeout: 5000 });
}

// ────────────────────────────────────────────────────────────────────────────
test.describe('RFC587-B4 resilience-card', () => {

  test('B4.card-hidden: card hidden when flag OFF (default)', async ({ page }) => {
    test.skip(LIVE, 'flag-off test runs in mock mode only');
    // No setupFlag -- want default off-state
    await page.goto(URL);
    await page.waitForLoadState('domcontentloaded');
    // Wait for ResilienceCard global to be present (script loaded)
    await page.waitForFunction(
      () => typeof window.ResilienceCard !== 'undefined', { timeout: 5000 }
    );
    await page.waitForTimeout(200);
    const card = page.locator('#resilience-card');
    await expect(card).toBeHidden();
  });

  test('B4.card-visible: card visible + renders node rows when flag ON', async ({ page }) => {
    test.skip(LIVE, 'mock-only test (deterministic shape)');
    const payload = buildPayload({
      incidents: [
        incidentRow('TEMPO', 'AUTH_WALL', 'RED'),
        incidentRow('DRAGON', 'FLAG_DRIFT', 'YELLOW'),
      ],
      nodes: {
        TEMPO:  nodeRollup('AUTH_WALL', ['AUTH_WALL']),
        DRAGON: nodeRollup('FLAG_DRIFT', ['FLAG_DRIFT', 'WATCH']),
      },
    });
    await setupMock(page, payload);
    await page.goto(URL);
    await waitForCardSettled(page);
    await expect(page.locator('#resilience-card')).toBeVisible();
    const rows = page.locator('#resilience-card-body table.resilience-card-table tbody tr');
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0).locator('.rc-node')).toHaveText('DRAGON');
    await expect(rows.nth(1).locator('.rc-node')).toHaveText('TEMPO');
    // Badge count = incidents.length, no truncated marker
    await expect(page.locator('#resilience-card-badge')).toHaveText('2');
  });

  test('B4.dot-red: dot=red when ≥1 RED-severity incident present', async ({ page }) => {
    test.skip(LIVE, 'mock-only test (severity injection)');
    const payload = buildPayload({
      incidents: [
        incidentRow('TEMPO', 'AUTH_WALL', 'RED'),
        incidentRow('DRAGON', 'DEGRADED', 'YELLOW'),
      ],
      nodes: {
        TEMPO:  nodeRollup('AUTH_WALL'),
        DRAGON: nodeRollup('DEGRADED'),
      },
    });
    await setupMock(page, payload);
    await page.goto(URL);
    await waitForCardSettled(page);
    await expect(page.locator('#resilience-card-dot')).toHaveClass(/resilience-card-dot--red/);
  });

  test('B4.dot-yellow: dot=yellow when only YELLOW severities present', async ({ page }) => {
    test.skip(LIVE, 'mock-only test (severity injection)');
    const payload = buildPayload({
      incidents: [
        incidentRow('DRAGON', 'DEGRADED', 'YELLOW'),
        incidentRow('NIMBUS', 'FLAG_DRIFT', 'YELLOW'),
      ],
      nodes: {
        DRAGON: nodeRollup('DEGRADED'),
        NIMBUS: nodeRollup('FLAG_DRIFT'),
      },
    });
    await setupMock(page, payload);
    await page.goto(URL);
    await waitForCardSettled(page);
    await expect(page.locator('#resilience-card-dot')).toHaveClass(/resilience-card-dot--yellow/);
  });

  test('B4.dot-green: dot=green when no incidents in window', async ({ page }) => {
    test.skip(LIVE, 'mock-only test (empty injection)');
    await setupMock(page, buildPayload({ incidents: [], nodes: {} }));
    await page.goto(URL);
    await waitForCardSettled(page);
    await expect(page.locator('#resilience-card-dot')).toHaveClass(/resilience-card-dot--green/);
    await expect(page.locator('#resilience-card-body')).toContainText(/no resilience incidents/i);
  });

  test('B4.truncated: truncated indicator shows when payload.truncated=true', async ({ page }) => {
    test.skip(LIVE, 'mock-only test (truncated flag injection)');
    const payload = buildPayload({
      incidents: [incidentRow('TEMPO', 'WATCH', 'GREEN')],
      nodes: { TEMPO: nodeRollup('WATCH') },
      truncated: true,
    });
    await setupMock(page, payload);
    await page.goto(URL);
    await waitForCardSettled(page);
    await expect(page.locator('#resilience-card-badge')).toHaveText('1+');
    await expect(page.locator('#resilience-card .resilience-card-truncated')).toBeVisible();
  });

  test('B4.error: error banner + retry button on HTTP non-200', async ({ page }) => {
    test.skip(LIVE, 'mock-only test (forced error)');
    await setupMock(page, null, 503);
    await page.goto(URL);
    await waitForCardSettled(page);
    await expect(page.locator('#resilience-card-dot'))
      .toHaveClass(/resilience-card-dot--error/);
    await expect(page.locator('#resilience-card-badge')).toHaveText('ERR');
    await expect(page.locator('#resilience-card .resilience-card-banner--error')).toBeVisible();
    await expect(page.locator('#resilience-card .resilience-card-retry')).toBeVisible();
  });

  test('B4.live-shape: real /api/resilience_incidents returns valid canonical shape', async ({ page }) => {
    test.skip(!LIVE, 'LIVE-only test (set LIVE=1 to enable real :8430 hit)');
    await setupFlag(page);
    await page.goto(URL);
    await page.waitForFunction(
      () => typeof window.ResilienceIncidents !== 'undefined', { timeout: 5000 }
    );
    // Hit the real endpoint via the wrapper
    const result = await page.evaluate(async () => {
      try {
        const payload = await window.ResilienceIncidents.fetch({ limit: 50, window_hours: 24 });
        const valid = window.ResilienceIncidents.validateShape(payload);
        return { ok: true, valid, payloadKeys: Object.keys(payload) };
      } catch (e) {
        return { ok: false, error: String(e && e.message ? e.message : e) };
      }
    });
    expect(result.ok, 'fetch did not throw: ' + JSON.stringify(result)).toBe(true);
    expect(result.valid.ok,
      'canonical shape valid: ' + JSON.stringify(result.valid)).toBe(true);
    expect(result.payloadKeys).toEqual(expect.arrayContaining(['incidents', 'nodes', 'truncated']));
  });

});
