import { describe, expect, it, vi } from 'vitest';
import { FourYearCyclePrimitive } from '../src/components/charts/FourYearCyclePrimitive.js';

describe('FourYearCyclePrimitive', () => {
  it('requests redraws and renders a YTD band using actual trading timestamps', () => {
    const coordinates = new Map([[100, 12], [200, 188]]);
    const chart = { timeScale: () => ({ timeToCoordinate: (time) => coordinates.get(time) ?? null, options: () => ({ barSpacing: 8 }) }) };
    const primitive = new FourYearCyclePrimitive(chart);
    const requestUpdate = vi.fn();
    primitive.attached({ requestUpdate });
    primitive.setBands([{ year: 2026, from: 100, to: 200, endInclusive: true, isFuture: false }]);
    const context = { fillStyle: '', strokeStyle: '', lineWidth: 0, font: '', fillRect: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(), fillText: vi.fn() };
    primitive.paneViews()[0].renderer().drawBackground({ useMediaCoordinateSpace: (draw) => draw({ context, mediaSize: { width: 220, height: 400 } }) });
    expect(requestUpdate).toHaveBeenCalledTimes(2);
    expect(context.fillRect).toHaveBeenCalledWith(12, 0, 180, 400);
    expect(context.fillText).toHaveBeenCalledWith('2026 Bearish', 18, 17);
  });

  it('draws nothing when toggled off and redraws when toggled on again', () => {
    const chart = { timeScale: () => ({ timeToCoordinate: (time) => time === 1 ? 20 : 120, options: () => ({ barSpacing: 8 }) }) };
    const primitive = new FourYearCyclePrimitive(chart);
    const requestUpdate = vi.fn();
    const context = { fillStyle: '', strokeStyle: '', lineWidth: 0, font: '', fillRect: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(), fillText: vi.fn() };
    const target = { useMediaCoordinateSpace: (draw) => draw({ context, mediaSize: { width: 220, height: 400 } }) };
    primitive.attached({ requestUpdate });
    primitive.setBands([]);
    primitive.paneViews()[0].renderer().drawBackground(target);
    expect(context.fillRect).not.toHaveBeenCalled();
    primitive.setBands([{ year: 2010, from: 1, to: 2, endInclusive: false }]);
    primitive.paneViews()[0].renderer().drawBackground(target);
    expect(context.fillRect).toHaveBeenCalledTimes(1);
    expect(requestUpdate).toHaveBeenCalledTimes(3);
    primitive.detached();
    primitive.setBands([]);
    expect(requestUpdate).toHaveBeenCalledTimes(3);
  });
});
