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

  it('detects an intraday low even when the latest price has recovered', () => {
    expect(isLimitPriceReached(buy, { lastPrice: 105, sessionLow: 99, sessionHigh: 106 })).toBe(true);
  });

  it('triggers a sell limit at or above the limit price', () => {
    expect(isLimitPriceReached(sell, 100)).toBe(true);
    expect(isLimitPriceReached(sell, 100.01)).toBe(true);
    expect(isLimitPriceReached(sell, 99.99)).toBe(false);
  });

  it('detects an intraday high even when the latest price has moved lower', () => {
    expect(isLimitPriceReached(sell, { lastPrice: 95, sessionLow: 94, sessionHigh: 101 })).toBe(true);
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

  it('keeps a reached order ready after the market moves away', () => {
    expect(getLimitOrderState({ ...buy, status: 'READY' }, 110)).toBe('ready');
  });
});
