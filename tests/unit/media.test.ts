import { describe, it, expect } from 'vitest';
import { collectMedia, photoPath, signaturePath, signatureRole } from '../../src/lib/media';
import type { TemplateDef } from '../../src/templates/types';
import type { AnswersMap } from '../../src/types';

const template: TemplateDef = {
  id: 'reactive_callout',
  name: 'Test',
  system_type: null,
  job_type: 'reactive_callout',
  version: 1,
  sections: [
    {
      id: 'zones', title: 'Zones', repeatable: true,
      fields: [
        { id: 'zone', type: 'text', label: 'Zone' },
        { id: 'zone_photos', type: 'photo', label: 'Zone photo' },
      ],
    },
    {
      id: 'sign_off', title: 'Sign off',
      fields: [
        { id: 'photos', type: 'photo', label: 'Photos' },
        { id: 'engineer_signature', type: 'signature', label: 'Engineer' },
        { id: 'customer_signature', type: 'signature', label: 'Customer' },
      ],
    },
  ],
};

describe('storage paths', () => {
  it('put photos and signatures under {company}/{jobsheet}/', () => {
    expect(photoPath('co', 'js', 'p1')).toBe('co/js/p1.jpg');
    expect(signaturePath('co', 'js', 'customer')).toBe('co/js/signatures/customer.png');
  });

  it('maps template signature fields to engineer/customer', () => {
    expect(signatureRole('engineer_signature')).toBe('engineer');
    expect(signatureRole('customer_signature')).toBe('customer');
  });
});

describe('collectMedia', () => {
  it('finds photos in repeat instances and top-level fields, and both signatures', () => {
    const answers: AnswersMap = {
      zones_instances: [
        { zone: '1', zone_photos: [{ id: 'a', storage_path: 'co/js/a.jpg' }] },
        { zone: '2' },
        { zone: '3', zone_photos: [{ id: 'b', storage_path: 'co/js/b.jpg' }] },
      ],
      photos: [{ id: 'c', storage_path: 'co/js/c.jpg', caption: 'Panel' }],
      engineer_signature: { storage_path: 'co/js/signatures/engineer.png', captured_at: '2026-10-20T12:00:00Z' },
      customer_signature: null,
    };
    const media = collectMedia(template, answers);
    expect(media.photos.map(p => [p.ref.id, p.label])).toEqual([
      ['a', 'Zone photo'], ['b', 'Zone photo'], ['c', 'Photos'],
    ]);
    expect(media.signatures).toEqual([
      { ref: answers.engineer_signature, role: 'engineer' },
    ]);
  });

  it('ignores old photo refs that only had a blob: URL', () => {
    const answers = { photos: [{ id: 'old', local_uri: 'blob:x' }] } as unknown as AnswersMap;
    expect(collectMedia(template, answers).photos).toEqual([]);
  });
});
