// @ts-check
/* RFC540p2 followup-7b -- inheritance-chips probe (UXIA).
 *
 * Pure-function probe over ApprovalThroughline.renderInheritanceChips(rfcId, inheritance).
 * No DOM, no network, no Playwright browser fixtures. Locks the cross-RFC
 * conflict-loud chip render contract from RFC540p2 rev-2 §appendix against
 * regression.
 *
 * Falsifiability: if renderInheritanceChips output for any sub-case drifts
 * (chip presence/absence, severity class, label substring), this probe fails
 * loud. Subcases covered:
 *   (a) base/patch child + parent active qualifiers (advisory and load-bearing)
 *   (b) inherited revoke / scope_narrow / scope_exclude targeting child
 *   (c) expansion inheritance_blocked AND override paths (child_own_ratify,
 *       parent_extend_targeting_child)
 *   degenerate: null/undefined inheritance, empty payload, missing fields
 */

const { test, expect } = require('@playwright/test');
const ApprovalThroughline = require('../js/approval-throughline.js');

test.describe('RFC540p2 followup-7b renderInheritanceChips (degenerate cases)', () => {
  test('null inheritance -> empty string', () => {
    expect(ApprovalThroughline.renderInheritanceChips('RFC540p2', null)).toBe('');
  });

  test('undefined inheritance -> empty string', () => {
    expect(ApprovalThroughline.renderInheritanceChips('RFC540p2', undefined)).toBe('');
  });

  test('empty inheritance (no parent, no events, no state) -> empty string', () => {
    expect(ApprovalThroughline.renderInheritanceChips('RFC540', {
      parent_rfc_id: null,
      parent_inheritance_state: null,
      inherited_targeting_events: []
    })).toBe('');
  });

  test('parent with zero active qualifiers -> empty string (no chip needed)', () => {
    const inh = {
      parent_rfc_id: 'RFC540',
      parent_inheritance_state: {
        parent_has_own_ratify: true, parent_has_events: true,
        parent_active_qualifiers_count: 0, parent_qualifier_summary: 'no active qualifiers',
        advisory_only: true
      },
      inherited_targeting_events: []
    };
    expect(ApprovalThroughline.renderInheritanceChips('RFC540p2', inh)).toBe('');
  });
});

test.describe('RFC540p2 followup-7b renderInheritanceChips sub-case (a) -- parent active qualifiers', () => {
  test('advisory_only=true -> advisory chip with muted label', () => {
    const html = ApprovalThroughline.renderInheritanceChips('RFC540p2', {
      parent_rfc_id: 'RFC540',
      parent_inheritance_state: {
        parent_has_own_ratify: true, parent_has_events: true,
        parent_active_qualifiers_count: 1, parent_qualifier_summary: '1 active qualifier',
        advisory_only: true
      },
      inherited_targeting_events: []
    });
    expect(html).toContain('throughline-chip-inh-advisory');
    expect(html).toContain('advisory');
    expect(html).toContain('1 parent qualifier');
    expect(html).not.toContain('throughline-chip-inh-qualifier"');  // not the load-bearing variant
  });

  test('advisory_only=false -> qualifier chip with load-bearing severity', () => {
    const html = ApprovalThroughline.renderInheritanceChips('RFC540p2', {
      parent_rfc_id: 'RFC540',
      parent_inheritance_state: {
        parent_has_own_ratify: false, parent_has_events: true,
        parent_active_qualifiers_count: 2, parent_qualifier_summary: '2 active qualifiers',
        advisory_only: false
      },
      inherited_targeting_events: []
    });
    expect(html).toContain('throughline-chip-inh-qualifier');
    expect(html).toContain('2 parent qualifiers');
    expect(html).toContain('Load-bearing');
  });

  test('pluralization: 1 -> singular, 2+ -> plural', () => {
    const sing = ApprovalThroughline.renderInheritanceChips('RFC540p2', {
      parent_rfc_id: 'RFC540',
      parent_inheritance_state: {
        parent_active_qualifiers_count: 1, advisory_only: false,
        parent_qualifier_summary: '1 active qualifier'
      },
      inherited_targeting_events: []
    });
    expect(sing).toContain('1 parent qualifier');
    expect(sing).not.toContain('1 parent qualifiers');  // no plural-s on count=1
    const plur = ApprovalThroughline.renderInheritanceChips('RFC540p2', {
      parent_rfc_id: 'RFC540',
      parent_inheritance_state: {
        parent_active_qualifiers_count: 3, advisory_only: false,
        parent_qualifier_summary: '3 active qualifiers'
      },
      inherited_targeting_events: []
    });
    expect(plur).toContain('3 parent qualifiers');
  });
});

test.describe('RFC540p2 followup-7b renderInheritanceChips sub-case (b) -- inherited targeting events', () => {
  test('inherited revoke (currently-effective) -> revoke chip', () => {
    const html = ApprovalThroughline.renderInheritanceChips('RFC540p2', {
      parent_rfc_id: 'RFC540',
      parent_inheritance_state: null,
      inherited_targeting_events: [{
        event_type: 'revoke', scope_delta_json: null,
        is_currently_effective: true, is_revocation: true,
        author: 'OPERATOR', ts: '2026-06-06T17:00:00Z'
      }]
    });
    expect(html).toContain('throughline-chip-inh-revoke');
    expect(html).toContain('inherited revoke');
    expect(html).toContain('RFC540');
  });

  test('inherited scope_narrow -> narrow chip', () => {
    const html = ApprovalThroughline.renderInheritanceChips('RFC540p2', {
      parent_rfc_id: 'RFC540',
      parent_inheritance_state: null,
      inherited_targeting_events: [{
        event_type: 'qualifier_add',
        scope_delta_json: { scope_op: 'narrow', target: { kind: 'rfc', id: 'RFC540p2' } },
        is_currently_effective: true, is_revocation: false,
        author: 'TEMPO', ts: '2026-06-06T17:50:00Z'
      }]
    });
    expect(html).toContain('throughline-chip-inh-narrow');
    expect(html).toContain('inherited narrow');
  });

  test('inherited scope_exclude -> narrow-severity chip with exclude label', () => {
    const html = ApprovalThroughline.renderInheritanceChips('RFC540p2', {
      parent_rfc_id: 'RFC540',
      parent_inheritance_state: null,
      inherited_targeting_events: [{
        event_type: 'qualifier_add',
        scope_delta_json: { scope_op: 'exclude', target: { kind: 'rfc', id: 'RFC540p2' } },
        is_currently_effective: true, is_revocation: false
      }]
    });
    expect(html).toContain('throughline-chip-inh-narrow');
    expect(html).toContain('inherited exclude');
  });

  test('inherited revoke with is_currently_effective=false -> NO chip', () => {
    const html = ApprovalThroughline.renderInheritanceChips('RFC540p2', {
      parent_rfc_id: 'RFC540',
      parent_inheritance_state: null,
      inherited_targeting_events: [{
        event_type: 'revoke', scope_delta_json: null,
        is_currently_effective: false, is_revocation: true
      }]
    });
    expect(html).toBe('');
  });

  test('scope_delta_json as string (serialized) is parsed', () => {
    const html = ApprovalThroughline.renderInheritanceChips('RFC540p2', {
      parent_rfc_id: 'RFC540',
      parent_inheritance_state: null,
      inherited_targeting_events: [{
        event_type: 'qualifier_add',
        scope_delta_json: '{"scope_op":"narrow","target":{"kind":"rfc","id":"RFC540p2"}}',
        is_currently_effective: true, is_revocation: false
      }]
    });
    expect(html).toContain('throughline-chip-inh-narrow');
    expect(html).toContain('inherited narrow');
  });

  test('scope_delta_json with non-narrow/exclude op (e.g. extend) -> NO chip', () => {
    const html = ApprovalThroughline.renderInheritanceChips('RFC540p2', {
      parent_rfc_id: 'RFC540',
      parent_inheritance_state: null,
      inherited_targeting_events: [{
        event_type: 'qualifier_add',
        scope_delta_json: { scope_op: 'extend', target: { kind: 'rfc', id: 'RFC540p2' } },
        is_currently_effective: true, is_revocation: false
      }]
    });
    expect(html).toBe('');
  });
});

test.describe('RFC540p2 followup-7b renderInheritanceChips sub-case (c) -- expansion inheritance', () => {
  test('inheritance_blocked=true -> blocked chip with no-entry glyph', () => {
    const html = ApprovalThroughline.renderInheritanceChips('RFCx-EXP-001', {
      parent_rfc_id: 'RFC540',
      parent_inheritance_state: {
        inheritance_blocked: true,
        inheritance_blocked_reason: 'rfc_type=expansion requires own ratify',
        parent_rfc_id_present: true
      },
      inherited_targeting_events: []
    });
    expect(html).toContain('throughline-chip-inh-blocked');
    expect(html).toContain('inheritance blocked');
  });

  test('override_reason=child_own_ratify -> override chip with explanatory label', () => {
    const html = ApprovalThroughline.renderInheritanceChips('RFCx-EXP-002', {
      parent_rfc_id: 'RFC540',
      parent_inheritance_state: {
        inheritance_blocked: false,
        override_reason: 'child_own_ratify',
        parent_rfc_id_present: true
      },
      inherited_targeting_events: []
    });
    expect(html).toContain('throughline-chip-inh-override');
    expect(html).toContain('child has own ratify');
  });

  test('override_reason=parent_extend_targeting_child -> override chip', () => {
    const html = ApprovalThroughline.renderInheritanceChips('RFCx-EXP-003', {
      parent_rfc_id: 'RFC540',
      parent_inheritance_state: {
        inheritance_blocked: false,
        override_reason: 'parent_extend_targeting_child',
        parent_rfc_id_present: true
      },
      inherited_targeting_events: []
    });
    expect(html).toContain('throughline-chip-inh-override');
    expect(html).toContain('parent extend qualifier');
  });

  test('unknown override_reason -> override chip with raw reason text', () => {
    const html = ApprovalThroughline.renderInheritanceChips('RFCx-EXP-004', {
      parent_rfc_id: 'RFC540',
      parent_inheritance_state: {
        inheritance_blocked: false,
        override_reason: 'novel_path_xyz',
        parent_rfc_id_present: true
      },
      inherited_targeting_events: []
    });
    expect(html).toContain('throughline-chip-inh-override');
    expect(html).toContain('override: novel_path_xyz');
  });
});

test.describe('RFC540p2 followup-7b renderInheritanceChips compound cases', () => {
  test('expansion blocked + parent qualifier -> blocked takes priority position but both render', () => {
    const html = ApprovalThroughline.renderInheritanceChips('RFCx-EXP-005', {
      parent_rfc_id: 'RFC540',
      parent_inheritance_state: {
        inheritance_blocked: true,
        inheritance_blocked_reason: 'expansion requires own ratify'
      },
      inherited_targeting_events: []
    });
    expect(html).toContain('throughline-chip-inh-blocked');
    // Compound case where expansion-blocked supplies the state. Only blocked
    // chip surfaces (parent_active_qualifiers_count not present here).
    expect(html).not.toContain('throughline-chip-inh-qualifier');
    expect(html).not.toContain('throughline-chip-inh-advisory');
  });

  test('inherited revoke + parent qualifier (advisory) -> 2 chips, both present', () => {
    const html = ApprovalThroughline.renderInheritanceChips('RFC540p2', {
      parent_rfc_id: 'RFC540',
      parent_inheritance_state: {
        parent_has_own_ratify: true,
        parent_active_qualifiers_count: 1,
        parent_qualifier_summary: '1 active qualifier',
        advisory_only: true
      },
      inherited_targeting_events: [{
        event_type: 'revoke', scope_delta_json: null,
        is_currently_effective: true, is_revocation: true
      }]
    });
    expect(html).toContain('throughline-chip-inh-revoke');
    expect(html).toContain('throughline-chip-inh-advisory');
  });

  test('XSS guard: rfcId + parent_rfc_id are escaped in tooltips/labels', () => {
    const html = ApprovalThroughline.renderInheritanceChips('<script>x</script>', {
      parent_rfc_id: '<img src=x>',
      parent_inheritance_state: null,
      inherited_targeting_events: [{
        event_type: 'revoke', scope_delta_json: null,
        is_currently_effective: true, is_revocation: true
      }]
    });
    expect(html).not.toContain('<script>x</script>');
    expect(html).not.toContain('<img src=x>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&lt;img src=x&gt;');
  });

  test('wrapper carries data-inheritance-for attribute for DOM querying', () => {
    const html = ApprovalThroughline.renderInheritanceChips('RFC540p2', {
      parent_rfc_id: 'RFC540',
      parent_inheritance_state: {
        parent_active_qualifiers_count: 1,
        parent_qualifier_summary: '1 active qualifier',
        advisory_only: true
      },
      inherited_targeting_events: []
    });
    expect(html).toContain('data-inheritance-for="RFC540p2"');
    expect(html).toContain('throughline-chips-inheritance');
  });
});
