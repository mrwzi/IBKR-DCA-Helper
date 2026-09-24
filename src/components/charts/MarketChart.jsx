import { useEffect, useRef } from 'react';
import { CandlestickSeries, HistogramSeries, LineSeries, createChart, createSeriesMarkers } from 'lightweight-charts';
import { chartCycleBandsForBars, markersForBuys, normalizeBars } from '../../lib/chartData.js';
import { FourYearCyclePrimitive } from './FourYearCyclePrimitive.js';

const candleOptions = {
  upColor: '#4fd48a', downColor: '#ff777f', borderVisible: false,
  wickUpColor: '#4fd48a', wickDownColor: '#ff777f',
  priceLineVisible: true, lastValueVisible: true,
};

export function MarketChart({ dataKey, bars, buys, averageCost, showCycle, showBuys, showAverageCost, showVolume, onReady }) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef(null);
  const primitiveRef = useRef(null);
  const volumeRef = useRef(null);
  const averageRef = useRef(null);
  const markersRef = useRef(null);
  const fittedDataSignatureRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    const chart = createChart(container, {
      autoSize: true,
      layout: { background: { type: 'solid', color: '#0e1117' }, textColor: '#9aa5ba', panes: { separatorColor: '#232838', enableResize: true } },
      grid: { vertLines: { color: 'rgba(35, 40, 56, .62)' }, horzLines: { color: 'rgba(35, 40, 56, .62)' } },
      rightPriceScale: { borderColor: '#232838', minimumWidth: 78 },
      timeScale: { borderColor: '#232838', timeVisible: true, secondsVisible: false, rightOffset: 3, barSpacing: 8, minBarSpacing: 2 },
      crosshair: { mode: 1, vertLine: { color: 'rgba(154,165,186,.42)', labelBackgroundColor: '#272f41' }, horzLine: { color: 'rgba(154,165,186,.42)', labelBackgroundColor: '#272f41' } },
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: true },
      handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: true },
    });
    const series = chart.addSeries(CandlestickSeries, candleOptions, 0);
    const primitive = new FourYearCyclePrimitive(chart);
    chart.panes()[0].attachPrimitive(primitive);
    chartRef.current = chart;
    seriesRef.current = series;
    primitiveRef.current = primitive;
    markersRef.current = createSeriesMarkers(series, []);
    onReady?.({ updateLatest: (bar) => series.update(bar) });
    return () => {
      chart.panes()[0]?.detachPrimitive(primitive);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      primitiveRef.current = null;
      volumeRef.current = null;
      averageRef.current = null;
      markersRef.current = null;
      onReady?.(null);
    };
  }, [onReady]);

  useEffect(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!chart || !series) return;
    const normalized = normalizeBars(bars);
    series.setData(normalized);
    const signature = `${dataKey}|${normalized.length}|${normalized[0]?.time || ''}|${normalized.at(-1)?.time || ''}`;
    if (normalized.length && fittedDataSignatureRef.current !== signature) {
      chart.timeScale().fitContent();
      fittedDataSignatureRef.current = signature;
    }
  }, [dataKey, bars]);

  useEffect(() => {
    const primitive = primitiveRef.current;
    primitive?.setBands(showCycle ? chartCycleBandsForBars(bars) : []);
    primitive?.updateAllViews();
  }, [bars, showCycle]);

  useEffect(() => {
    markersRef.current?.setMarkers(showBuys ? markersForBuys(buys, bars) : []);
  }, [bars, buys, showBuys]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const normalized = normalizeBars(bars);
    if (showVolume && normalized.some((bar) => Number.isFinite(bar.volume))) {
      if (!volumeRef.current) {
        volumeRef.current = chart.addSeries(HistogramSeries, { priceFormat: { type: 'volume' }, priceScaleId: 'volume', lastValueVisible: false, priceLineVisible: false }, 1);
        chart.panes()[1]?.setStretchFactor(0.23);
      }
      volumeRef.current.setData(normalized.filter((bar) => Number.isFinite(bar.volume)).map((bar) => ({ time: bar.time, value: bar.volume, color: bar.close >= bar.open ? 'rgba(79,212,138,.44)' : 'rgba(255,119,127,.44)' })));
    } else if (volumeRef.current) {
      chart.removeSeries(volumeRef.current);
      volumeRef.current = null;
    }
  }, [bars, showVolume]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const normalized = normalizeBars(bars);
    if (showAverageCost && Number.isFinite(Number(averageCost)) && normalized.length) {
      if (!averageRef.current) {
        averageRef.current = chart.addSeries(LineSeries, { color: '#ffcc66', lineWidth: 1, lineStyle: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
      }
      averageRef.current.setData(normalized.map((bar) => ({ time: bar.time, value: Number(averageCost) })));
    } else if (averageRef.current) {
      chart.removeSeries(averageRef.current);
      averageRef.current = null;
    }
  }, [bars, averageCost, showAverageCost]);

  return <div ref={containerRef} className="marketChartCanvas" aria-label="Interactive market chart" />;
}
