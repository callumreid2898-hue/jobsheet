import { describe, it, expect } from 'vitest';
import { detectRemedials } from '../../src/form-engine/remedialDetector';
import type { TemplateDef } from '../../src/templates/types';
import type { AnswersMap } from '../../src/types';

const JS_ID = 'js-1';
const SITE_ID = 'site-1';
const CO_ID = 'co-1';

const minimalTemplate: TemplateDef = {
  id: 'reactive_callout',
  name: 'Reactive Callout',
  system_type: 'fire_alarm',
  job_type: 'reactive_callout',
  version: 1,
  sections: [],
};

describe('detectRemedials', () => {
  it('returns empty array for empty template', () => {
    expect(detectRemedials(minimalTemplate, {}, JS_ID, SITE_ID, CO_ID)).toEqual([]);
  });

  it('creates remedial when pass_fail_note result is fail', () => {
    const template: TemplateDef = {
      ...minimalTemplate,
      sections: [{
        id: 'test_section',
        title: 'Test',
        fields: [{
          id: 'battery_test',
          label: 'Battery Test',
          type: 'pass_fail_note',
          triggers_remedial: true,
          remedial_priority: 'urgent',
        }],
      }],
    };

    const answers: AnswersMap = {
      battery_test: { result: 'fail', note: 'Battery dead' },
    };

    const result = detectRemedials(template, answers, JS_ID, SITE_ID, CO_ID);
    expect(result).toHaveLength(1);
    expect(result[0].description).toBe('Battery Test: Battery dead');
    expect(result[0].priority).toBe('urgent');
    expect(result[0].jobsheet_id).toBe(JS_ID);
  });

  it('does NOT create remedial when pass_fail_note result is pass', () => {
    const template: TemplateDef = {
      ...minimalTemplate,
      sections: [{
        id: 's1',
        title: 'S1',
        fields: [{
          id: 'panel_test',
          label: 'Panel Test',
          type: 'pass_fail_note',
          triggers_remedial: true,
        }],
      }],
    };

    const result = detectRemedials(template, { panel_test: { result: 'pass', note: '' } }, JS_ID, SITE_ID, CO_ID);
    expect(result).toHaveLength(0);
  });

  it('creates remedial when yes_no_na answer is no', () => {
    const template: TemplateDef = {
      ...minimalTemplate,
      sections: [{
        id: 's1',
        title: 'S1',
        fields: [{
          id: 'logbook_present',
          label: 'Logbook Present',
          type: 'yes_no_na',
          triggers_remedial: true,
          remedial_priority: 'advisory',
        }],
      }],
    };

    const result = detectRemedials(template, { logbook_present: 'no' }, JS_ID, SITE_ID, CO_ID);
    expect(result).toHaveLength(1);
    expect(result[0].description).toBe('Logbook Present — not confirmed');
    expect(result[0].priority).toBe('advisory');
  });

  it('does NOT create remedial when yes_no_na answer is yes', () => {
    const template: TemplateDef = {
      ...minimalTemplate,
      sections: [{
        id: 's1',
        title: 'S1',
        fields: [{
          id: 'logbook_present',
          label: 'Logbook Present',
          type: 'yes_no_na',
          triggers_remedial: true,
        }],
      }],
    };

    const result = detectRemedials(template, { logbook_present: 'yes' }, JS_ID, SITE_ID, CO_ID);
    expect(result).toHaveLength(0);
  });

  it('does NOT create remedial when yes_no_na answer is n/a', () => {
    const template: TemplateDef = {
      ...minimalTemplate,
      sections: [{
        id: 's1',
        title: 'S1',
        fields: [{
          id: 'sprinklers',
          label: 'Sprinklers Tested',
          type: 'yes_no_na',
          triggers_remedial: true,
        }],
      }],
    };

    const result = detectRemedials(template, { sprinklers: 'n/a' }, JS_ID, SITE_ID, CO_ID);
    expect(result).toHaveLength(0);
  });

  it('creates one remedial per non-empty line in _free_text field', () => {
    const template: TemplateDef = {
      ...minimalTemplate,
      sections: [{
        id: 'additional',
        title: 'Additional',
        fields: [
          {
            id: 'remedials_free_text',
            label: 'Additional Remedials',
            type: 'longtext',
          },
          {
            id: 'remedial_priority',
            label: 'Priority',
            type: 'select',
            options: ['urgent', 'recommended', 'advisory'],
          },
        ],
      }],
    };

    const answers = {
      remedials_free_text: 'Replace detector in zone 3\nFix broken sounder\n\nUpdate logbook',
      remedial_priority: 'recommended',
    };

    const result = detectRemedials(template, answers, JS_ID, SITE_ID, CO_ID);
    expect(result).toHaveLength(3);
    expect(result[0].description).toBe('Replace detector in zone 3');
    expect(result[1].description).toBe('Fix broken sounder');
    expect(result[2].description).toBe('Update logbook');
    expect(result.every(r => r.priority === 'recommended')).toBe(true);
  });

  it('processes repeatable section instances independently', () => {
    const template: TemplateDef = {
      ...minimalTemplate,
      sections: [{
        id: 'devices',
        title: 'Devices',
        repeatable: true,
        repeat_label: 'Device',
        fields: [{
          id: 'device_test',
          label: 'Device Test',
          type: 'pass_fail_note',
          triggers_remedial: true,
          remedial_priority: 'recommended',
        }],
      }],
    };

    const answers: AnswersMap = {
      devices_instances: [
        { device_test: { result: 'pass', note: '' } },
        { device_test: { result: 'fail', note: 'Faulty' } },
        { device_test: { result: 'fail', note: 'No power' } },
      ],
    };

    const result = detectRemedials(template, answers, JS_ID, SITE_ID, CO_ID);
    expect(result).toHaveLength(2);
  });

  it('creates remedial when yes_no_na has remedialOn:yes and answer is yes', () => {
    const template: TemplateDef = {
      ...minimalTemplate,
      sections: [{
        id: 's1',
        title: 'S1',
        fields: [{
          id: 'failures_found',
          label: 'Any failures found?',
          type: 'yes_no_na',
          triggers_remedial: true,
          remedialOn: 'yes',
          remedial_priority: 'urgent',
        }],
      }],
    };

    const result = detectRemedials(template, { failures_found: 'yes' }, JS_ID, SITE_ID, CO_ID);
    expect(result).toHaveLength(1);
    expect(result[0].description).toBe('Any failures found? — yes (action required)');
    expect(result[0].priority).toBe('urgent');
  });

  it('does NOT create remedial when yes_no_na has remedialOn:yes and answer is no', () => {
    const template: TemplateDef = {
      ...minimalTemplate,
      sections: [{
        id: 's1',
        title: 'S1',
        fields: [{
          id: 'failures_found',
          label: 'Any failures found?',
          type: 'yes_no_na',
          triggers_remedial: true,
          remedialOn: 'yes',
          remedial_priority: 'urgent',
        }],
      }],
    };

    const result = detectRemedials(template, { failures_found: 'no' }, JS_ID, SITE_ID, CO_ID);
    expect(result).toHaveLength(0);
  });

  it('skips fields with null or undefined answers', () => {
    const template: TemplateDef = {
      ...minimalTemplate,
      sections: [{
        id: 's1',
        title: 'S1',
        fields: [{
          id: 'battery',
          label: 'Battery',
          type: 'pass_fail_note',
          triggers_remedial: true,
        }],
      }],
    };

    const result = detectRemedials(template, {}, JS_ID, SITE_ID, CO_ID);
    expect(result).toHaveLength(0);
  });
});
