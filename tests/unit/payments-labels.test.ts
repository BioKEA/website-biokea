import { describe, expect, it } from 'vitest';
import { statusLabel } from '@/lib/payments/labels';

describe('statusLabel', () => {
  it('never shows the lab the word deposit', () => {
    const all = ['quoted', 'deposit_invoiced', 'deposit_paid', 'balance_invoiced', 'paid'] as const;
    for (const s of all) expect(statusLabel(s)).not.toMatch(/deposit/i);
  });

  it('names what each state actually means now', () => {
    expect(statusLabel('deposit_invoiced')).toBe('Invoiced — awaiting payment');
    expect(statusLabel('deposit_paid')).toBe('Paid — awaiting samples');
    expect(statusLabel('balance_invoiced')).toBe('Additional samples invoiced');
    expect(statusLabel('paid')).toBe('Settled');
    expect(statusLabel('quoted')).toBe('Quoted');
  });
});
