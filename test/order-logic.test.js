import { describe, expect, it } from 'vitest';
import { getLimitOrderState, isLimitOrder, isLimitPriceReached } from '../src/lib/orderLogic.js';

describe('limit order logic', () => {
  const buy = { orderType: 'LIMIT', orderSide: 'BUY', limitPrice: 100 };
  const sell = { orderType: 'LIMIT', orderSide: 'SELL', limitPrice: 100 };

  it('triggers a buy limit at or below the limit price', () => {
    expect(isLimitPriceReached(buy, 100)).toBe(true);
    expect(isLimitPriceReached(buy, 99.99)).toBe(true);
    expect(isLimitPriceReached(buy, 100.01)).toBe(false);
  });

  it('triggers a sell limit at or above the limit price', () => {
    expect(isLimitPriceReached(sell, 100)).toBe(true);
    expect(isLimitPriceReached(sell, 100.01)).toBe(true);
    expect(isLimitPriceReached(sell, 99.99)).toBe(false);
  });

  it('does not report a trigger without valid market data', () => {
    expect(isLimitPriceReached(buy, null)).toBe(false);
    expect(isLimitPriceReached(buy, 'offline')).toBe(false);
    expect(getLimitOrderState({ orderType: 'MARKET' }, 90)).toBe('pending');
    expect(isLimitOrder({ orderType: 'MARKET' })).toBe(false);
  });

  it('never reports a cancelled broker order as ready', () => {
    expect(getLimitOrderState({ ...buy, status: 'CANCELLED' }, 90)).toBe('cancelled');
  });
});
