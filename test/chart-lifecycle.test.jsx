// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createCount: 0,
  removeCount: 0,
  resizeCount: 0,
  options: null,
  canvases: [],
}));

vi.mock('lightweight-charts', () => ({
  CandlestickSeries: 'CandlestickSeries',
  HistogramSeries: 'HistogramSeries',
  LineSeries: 'LineSeries',
  createSeriesMarkers: () => ({ setMarkers: vi.fn() }),
  createChart: (container, options) => {
    mocks.createCount += 1;
    mocks.options = options;
    const canvas = document.createElement('canvas');
    container.appendChild(canvas);
    mocks.canvases.push(canvas);
    const pane = { attachPrimitive: vi.fn((primitive) => primitive.attached?.({ requestUpdate: vi.fn() })), detachPrimitive: vi.fn((primitive) => primitive.detached?.()), setStretchFactor: vi.fn() };
    const timeScale = { fitContent: vi.fn(), timeToCoordinate: vi.fn(() => 20), options: vi.fn(() => ({ barSpacing: 8 })) };
    return {
      addSeries: vi.fn(() => ({ setData: vi.fn(), update: vi.fn() })),
      removeSeries: vi.fn(),
      panes: vi.fn(() => [pane, pane]),
      timeScale: vi.fn(() => timeScale),
      resize: vi.fn(() => { mocks.resizeCount += 1; }),
      remove: vi.fn(() => { mocks.removeCount += 1; canvas.remove(); }),
    };
  },
}));

import { MarketChart } from '../src/components/charts/MarketChart.jsx';

const makeBars = (offset) => [{ time: 1_700_000_000 + offset, open: 10, high: 12, low: 9, close: 11, volume: 100 }];
const baseProps = { buys: [], averageCost: null, showCycle: true, showBuys: false, showAverageCost: false, showVolume: false };

describe('MarketChart lifecycle and sizing', () => {
  let root;
  let mount;

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    Object.assign(mocks, { createCount: 0, removeCount: 0, resizeCount: 0, options: null, canvases: [] });
    mount = document.createElement('div');
    mount.style.height = '530px';
    document.body.appendChild(mount);
    root = createRoot(mount);
  });

  afterEach(async () => {
    if (root) await act(async () => root.unmount());
    mount?.remove();
    globalThis.IS_REACT_ACT_ENVIRONMENT = false;
  });

  it('keeps one chart/canvas and a stable host height through repeated timeframe data changes', async () => {
    const sequence = ['1D', '5D', '1M', '3M', '6M', 'YTD', '1Y', '5Y', '10Y', 'MAX', '1M', '10Y', '3M', 'MAX'];
    const render = async (timeframe, index) => act(async () => root.render(<MarketChart {...baseProps} dataKey={`NVDA|${timeframe}`} bars={makeBars(index * 1000)} />));
    await render(sequence[0], 0);
    const heightBefore = mount.style.height;
    const host = mount.querySelector('.marketChartCanvas');
    for (let index = 1; index < sequence.length; index += 1) await render(sequence[index], index);
    expect(mount.style.height).toBe(heightBefore);
    expect(mocks.createCount).toBe(1);
    expect(mount.querySelector('.marketChartCanvas')).toBe(host);
    expect(host.querySelectorAll('canvas')).toHaveLength(1);
    expect(mocks.resizeCount).toBe(0);
    expect(mocks.options.autoSize).toBe(true);
    expect(mocks.options).not.toHaveProperty('height');
  });

  it('removes the chart-owned canvas and observer lifecycle on actual unmount', async () => {
    await act(async () => root.render(<MarketChart {...baseProps} dataKey="NVDA|YTD" bars={makeBars(0)} />));
    await act(async () => root.unmount());
    root = null;
    expect(mocks.removeCount).toBe(1);
    expect(mount.querySelectorAll('canvas')).toHaveLength(0);
  });
});
