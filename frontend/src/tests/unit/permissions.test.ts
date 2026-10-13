import { describe, expect, it } from 'vitest';
import { ALL_PERMISSIONS, PERMISSIONS, PERMISSION_LABELS } from '@/lib/permissions';

describe('permission constants', () => {
  const keys = Object.keys(PERMISSIONS);

  it('declares the full permission catalogue', () => {
    expect(keys.length).toBeGreaterThanOrEqual(30);
    expect(PERMISSIONS.DASHBOARD_VIEW).toBe('dashboard:view');
    expect(PERMISSIONS.PAYMENT_REVERSE).toBe('payment:reverse');
    expect(PERMISSIONS.DRAW_CONFIRM).toBe('draw:confirm');
  });

  it('has no duplicated permission strings', () => {
    expect(new Set(ALL_PERMISSIONS).size).toBe(ALL_PERMISSIONS.length);
  });

  it('uses the resource:action shape everywhere', () => {
    for (const value of ALL_PERMISSIONS) {
      expect(value).toMatch(/^[a-z_]+(:[a-z_]+)+$/);
    }
  });

  it('labels every permission so the admin screen can list them', () => {
    for (const key of keys) {
      expect(PERMISSION_LABELS[PERMISSIONS[key as keyof typeof PERMISSIONS]], `missing label for ${key}`).toBeTruthy();
    }
  });
});
