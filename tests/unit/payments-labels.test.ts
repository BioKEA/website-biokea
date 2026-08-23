import { describe, expect, it } from 'vitest';
import { statusLabel } from '@/lib/payments/labels';

describe('statusLabel', () => {
  it('never shows the lab the word deposit', () => {
    const all = ['quoted', 'deposit_invoiced', 'deposit_paid', 'balance_invoiced', 'paid'] as const;
    for (const s of all) expect(statusLabel(s)).not.toMatch(/deposit/i);
  });

  it('names what each state actually means now', () => {
    expect(statusLabel('deposit_invoiced')).toBe('Invoiced — awaiting payment');
    expect(statusLabel('deposit_paid')).toBe('Payment received — awaiting samples');
    expect(statusLabel('balance_invoiced')).toBe('Additional samples invoiced');
    expect(statusLabel('paid')).toBe('Settled');
    expect(statusLabel('quoted')).toBe('Quoted');
  });

  it('does not claim deposit_paid means paid in full — legacy 50%-deposit rows share this status and still owe a balance', () => {
    expect(statusLabel('deposit_paid')).not.toMatch(/full/i);
    expect(statusLabel('deposit_paid')).not.toBe('Paid — awaiting samples');
  });
});
