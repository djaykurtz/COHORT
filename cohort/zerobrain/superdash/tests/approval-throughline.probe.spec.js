// @ts-check
/* RFC540p2 item-(5) -- fold-probe guard (UXIA).
 *
 * Pure-function probe over ApprovalThroughline.fold(events). No DOM, no
 * network, no Playwright browser fixtures. Locks the 5-step fold-rule
 * from RFC540 solidplan rev-1 against regression. Synthetic event arrays
 * cover the 5 canonical cases plus a few derived guards.
 *
 * Falsifiability: if fold() output for any of these cases drifts (glyph,
 * state, qualifierCount, or tooltip-substring), this probe fails loud. The
 * tooltip assertion uses substring containment, not equality, so cosmetic
 * tweaks to wording don't false-positive -- only contract-shape changes do.
 *
 * Per RFC540p2 rev-2 appendix: this probe operates on the single-RFC
 * event-array shape pre-inheritance-enrichment. parent_inheritance_state
 * and inherited_targeting_events are SEPARATE inputs handled at render
 * time (items-(2)/(3)/render-layer), out of scope for this probe.
 */

const { test, expect } = require('@playwright/test');
const ApprovalThroughline = require('../js/approval-throughline.js');

const TS_RATIFY  = '2026-06-06T01:00:00Z';
const TS_QUAL    = '2026-06-06T01:30:00Z';
const TS_REVOKE  = '2026-06-06T02:00:00Z';
const TS_NARROW  = '2026-06-06T02:30:00Z';

function ratify(ts)              { return { event_type: 'ratify',        ts, scope_delta_json: null }; }
function qualifierAdd(ts)        { return { event_type: 'qualifier_add', ts, scope_delta_json: null }; }
function qualifierNarrow(ts, target) {
  return { event_type: 'qualifier_add', ts,
           scope_delta_json: { scope_op: 'narrow', target: target || { kind: 'rfc', id: 'RFC999' } } };
}
function revoke(ts)              { return { event_type: 'revoke',        ts, scope_delta_json: null }; }

test.describe('RFC540p2 item-(5) fold-probe (5 canonical cases)', () => {
  test('case (i): empty array -> unapproved glyph *', () => {
    const r = ApprovalThroughline.fold([]);
    expect(r.glyph).toBe('*');
    expect(r.state).toBe('unapproved');
    expect(r.qualifierCount).toBe(0);
    expect(r.tooltip).toContain('No approval events');
  });

  test('case (ii): ratify-only -> plain green check', () => {
    const r = ApprovalThroughline.fold([ratify(TS_RATIFY)]);
    expect(r.glyph).toBe('\u2713');
    expect(r.state).toBe('approved');
    expect(r.qualifierCount).toBe(0);
    expect(r.tooltip).toContain('no qualifiers');
  });

  test('case (iii): ratify + qualifier_add (no scope_delta) -> qualified-green-superscript', () => {
    const r = ApprovalThroughline.fold([ratify(TS_RATIFY), qualifierAdd(TS_QUAL)]);
    expect(r.glyph).toBe('\u2713');
    expect(r.state).toBe('qualified');
    expect(r.qualifierCount).toBe(1);
    expect(r.tooltip).toContain('1 qualifier');
  });

  test('case (iv): ratify + revoke -> warn', () => {
    const r = ApprovalThroughline.fold([ratify(TS_RATIFY), revoke(TS_REVOKE)]);
    expect(r.glyph).toBe('\u26A0');
    expect(r.state).toBe('warn');
    expect(r.tooltip).toContain('REVOKED');
  });

  test('case (v): ratify + qualifier_add{scope_op:narrow} -> warn', () => {
    const r = ApprovalThroughline.fold([ratify(TS_RATIFY), qualifierNarrow(TS_NARROW)]);
    expect(r.glyph).toBe('\u26A0');
    expect(r.state).toBe('warn');
    expect(r.tooltip).toContain('scope narrowed');
    expect(r.qualifierCount).toBe(1);
  });
});

test.describe('RFC540p2 item-(5) fold-probe (derived guards)', () => {
  test('null events -> unapproved (same as empty)', () => {
    const r = ApprovalThroughline.fold(null);
    expect(r.glyph).toBe('*');
    expect(r.state).toBe('unapproved');
  });

  test('out-of-order events are sorted chronologically (defensive)', () => {
    const ordered  = ApprovalThroughline.fold([ratify(TS_RATIFY), qualifierAdd(TS_QUAL)]);
    const shuffled = ApprovalThroughline.fold([qualifierAdd(TS_QUAL), ratify(TS_RATIFY)]);
    expect(shuffled.state).toBe(ordered.state);
    expect(shuffled.qualifierCount).toBe(ordered.qualifierCount);
    expect(shuffled.glyph).toBe(ordered.glyph);
  });

  test('re-ratify after revoke clears revocation (warn -> approved)', () => {
    const TS_RERATIFY = '2026-06-06T03:00:00Z';
    const r = ApprovalThroughline.fold([
      ratify(TS_RATIFY),
      revoke(TS_REVOKE),
      ratify(TS_RERATIFY),
    ]);
    expect(r.state).toBe('approved');
    expect(r.glyph).toBe('\u2713');
  });

  test('scope_delta_json as JSON string is parsed (defensive)', () => {
    const e = { event_type: 'qualifier_add', ts: TS_NARROW,
                scope_delta_json: JSON.stringify({ scope_op: 'narrow', target: { kind: 'rfc', id: 'RFC999' } }) };
    const r = ApprovalThroughline.fold([ratify(TS_RATIFY), e]);
    expect(r.state).toBe('warn');
    expect(r.tooltip).toContain('scope narrowed');
  });

  test('multiple qualifiers -> qualifierCount tracks length', () => {
    const r = ApprovalThroughline.fold([
      ratify(TS_RATIFY),
      qualifierAdd(TS_QUAL),
      { event_type: 'approve_conditional', ts: TS_NARROW, scope_delta_json: null },
    ]);
    expect(r.state).toBe('qualified');
    expect(r.qualifierCount).toBe(2);
    expect(r.tooltip).toContain('2 qualifiers');
  });
});
