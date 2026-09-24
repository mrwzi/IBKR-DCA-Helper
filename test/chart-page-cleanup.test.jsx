// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/components/charts/MarketChart.jsx', () => ({ MarketChart: () => <div className="mockMarketChart" /> }));

import { ChartPage } from '../src/pages/ChartPage.jsx';

describe('ChartPage quote subscription cleanup', () => {
  let root;
  let mount;

  beforeEach(() => {
    vi.useFakeTimers();
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    window.dcaApi = {
      loadChart: vi.fn().mockResolvedValue({
        provider: 'Yahoo', status: 'AVAILABLE', sourceLabel: 'Yahoo • AVAILABLE',
        bars: [{ time: 1_700_000_000, open: 10, high: 12, low: 9, close: 11 }],
        quote: { price: 11, currency: 'USD' }, instrument: { ticker: 'NVDA', name: 'NVIDIA', currency: 'USD' },
      }),
      getChartQuote: vi.fn().mockResolvedValue({ provider: 'Yahoo', status: 'AVAILABLE', sourceLabel: 'Yahoo • AVAILABLE', quote: { price: 11, currency: 'USD' } }),
      searchChartSymbols: vi.fn().mockResolvedValue([]),
    };
    mount = document.createElement('div');
    document.body.appendChild(mount);
    root = createRoot(mount);
  });

  afterEach(async () => {
    if (root) await act(async () => root.unmount());
    mount?.remove();
    vi.clearAllTimers();
    vi.useRealTimers();
    globalThis.IS_REACT_ACT_ENVIRONMENT = false;
  });

  it('clears the quote polling timer on unmount', async () => {
    await act(async () => {
      root.render(<ChartPage holdings={[{ id: 1, ticker: 'NVDA', priceSymbol: 'NVDA', name: 'NVIDIA', currency: 'USD', enabled: true }]} buyLog={[]} settings={{ priceSource: 'Yahoo' }} />);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(vi.getTimerCount()).toBe(1);
    await act(async () => root.unmount());
    root = null;
    expect(vi.getTimerCount()).toBe(0);
  });
});
