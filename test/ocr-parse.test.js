import { describe, expect, it } from 'vitest';
import { parseBrokerageBuyScreenshot } from '../src/lib/ocrParse.js';

describe('limit-order screenshot parsing', () => {
  it('reads cash amount, side, ticker, and limit price from an IBKR preview', () => {
    const parsed = parseBrokerageBuyScreenshot([
      'Order Confirmation',
      'BUY 10 USD NVDA @ 161.47 USD',
      'Action Buy',
      'Order Type Limit',
      'Quantity 10 USD',
      'Limit Price 161.47',
      'Commissions (est.) 0.10 USD',
      'Funds On Hold 166 CAD',
      'Transmit',
    ].join('\n'), ['NVDA'], 'USD');
    expect(parsed).toMatchObject({
      transactionStatus: 'preview',
      action: 'BUY',
      ticker: 'NVDA',
      mode: 'cash',
      cashPaidAmount: 10,
      cashPaidCurrency: 'USD',
      orderType: 'LIMIT',
      limitPrice: 161.47,
      priceCurrency: 'USD',
      feeAmount: 0.1,
      feeCurrency: 'USD',
    });
  });
});
