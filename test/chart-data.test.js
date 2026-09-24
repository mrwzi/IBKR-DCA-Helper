import { describe, expect, it } from 'vitest';
import chartCycle from '../src/lib/chartCycle.js';
import chartData from '../src/lib/chartData.js';

const { FOUR_YEAR_CYCLE, isBearishYear, cycleBands, cycleBandsForTimestamps } = chartCycle;
const { normalizeBars, normalizeInstrument, instrumentKey, chartCycleBandsForBars, markersForBuys, providerLabel, timeframeConfig } = chartData;

const timestamp = (date) => Date.parse(`${date}T16:00:00Z`) / 1000;
const bar = (date, close = 10) => ({ time: timestamp(date), open: close - 1, high: close + 1, low: close - 2, close });

describe('4-Year Cycle', () => {
  it.each([[1998, true], [1999, false], [2002, true], [2006, true], [2009, false], [2010, true], [2011, false], [2013, false], [2014, true], [2015, false], [2017, false], [2018, true], [2021, false], [2022, true], [2025, false], [2026, true], [2029, false], [2030, true], [2034, true], [2038, true], [2042, true]])('%i is bearish: %s', (year, expected) => {
    expect(isBearishYear(year)).toBe(expected);
  });

  it('uses configuration instead of a hard-coded year list', () => {
    expect(FOUR_YEAR_CYCLE).toMatchObject({ anchorReferenceYear: 2014, periodYears: 4, bearishDuration: 'calendar-year' });
    expect(cycleBands(Date.UTC(2025, 0, 1) / 1000, Date.UTC(2027, 0, 1) / 1000).map((band) => band.year)).toEqual([2026]);
  });

  it('generates visible ranges entirely before, across, and after the 2014 reference', () => {
    expect(cycleBandsForTimestamps([timestamp('2001-01-03'), timestamp('2002-01-02'), timestamp('2002-12-30'), timestamp('2003-01-02')]).map((band) => band.year)).toEqual([2002]);
    expect(cycleBandsForTimestamps([timestamp('2010-01-04'), timestamp('2010-12-30'), timestamp('2014-01-02'), timestamp('2014-12-30'), timestamp('2015-01-02')]).map((band) => band.year)).toEqual([2010, 2014]);
    expect(cycleBandsForTimestamps([timestamp('2021-01-04'), timestamp('2022-01-03'), timestamp('2022-12-30'), timestamp('2026-01-02')]).map((band) => band.year)).toEqual([2022, 2026]);
  });

  it('uses actual trading timestamps when Jan 1 and Dec 31 are absent', () => {
    const times = [timestamp('2005-12-30'), timestamp('2006-01-03'), timestamp('2006-12-29'), timestamp('2007-01-02')];
    expect(cycleBandsForTimestamps(times)).toEqual([{ year: 2006, from: timestamp('2006-01-03'), to: timestamp('2007-01-02'), endInclusive: false, isFuture: false }]);
  });

  it('renders YTD 2026 through the last actual bar when no next-year bar exists', () => {
    const band = cycleBandsForTimestamps([timestamp('2026-01-02'), timestamp('2026-02-16'), timestamp('2026-08-28')])[0];
    expect(band).toEqual({ year: 2026, from: timestamp('2026-01-02'), to: timestamp('2026-08-28'), endInclusive: true, isFuture: false });
  });

  it('finds every applicable 10Y and MAX historical cycle without a 2014 cutoff', () => {
    const tenYearBars = [bar('2017-01-03'), bar('2018-01-02'), bar('2018-12-28'), bar('2019-01-02'), bar('2022-01-03'), bar('2022-12-30'), bar('2023-01-03'), bar('2026-01-02'), bar('2026-08-28')];
    expect(chartCycleBandsForBars(tenYearBars).map((band) => band.year)).toEqual([2018, 2022, 2026]);
    const maxBars = [bar('1999-01-04'), bar('2002-01-02'), bar('2002-12-30'), bar('2003-01-02'), bar('2006-01-03'), bar('2006-12-29'), bar('2007-01-02'), bar('2010-01-04'), bar('2010-12-30'), bar('2011-01-03'), ...tenYearBars];
    expect(chartCycleBandsForBars(maxBars).map((band) => band.year)).toEqual([2002, 2006, 2010, 2018, 2022, 2026]);
  });

  it('handles weekend/holiday boundaries and leap years without inventing bands', () => {
    const times = [timestamp('2018-01-02'), timestamp('2018-12-28'), timestamp('2019-01-02'), timestamp('2020-02-29'), timestamp('2022-01-03')];
    expect(cycleBandsForTimestamps(times).map((band) => band.year)).toEqual([2018, 2022]);
  });
});

describe('chart data integrity', () => {
  const bars = [
    { time: 100, open: 10, high: 12, low: 9, close: 11, volume: 50 },
    { time: 100, open: 10, high: 13, low: 9, close: 12, volume: 60 },
    { time: 200, open: 12, high: 14, low: 11, close: 13, volume: 70 },
    { time: 300, open: 5, high: 4, low: 3, close: 4 },
  ];

  it('sorts bars, replaces duplicate timestamps, and rejects malformed OHLC rows', () => {
    expect(normalizeBars(bars)).toEqual([
      { time: 100, open: 10, high: 13, low: 9, close: 12, volume: 60 },
      { time: 200, open: 12, high: 14, low: 11, close: 13, volume: 70 },
    ]);
  });

  it('keeps historical bands tied only to real market timestamps', () => {
    const values = [bar('2010-01-04'), bar('2010-12-30'), bar('2011-01-03'), bar('2014-01-02'), bar('2014-12-30')];
    expect(chartCycleBandsForBars(values).map((band) => band.year)).toEqual([2010, 2014]);
    expect(chartCycleBandsForBars(values).every((band) => !band.isFuture)).toBe(true);
  });

  it('keeps similarly named instruments separate and switches timeframe configurations', () => {
    const nyse = instrumentKey(normalizeInstrument({ ticker: 'ABC', exchange: 'NYSE', currency: 'USD' }));
    const tsx = instrumentKey(normalizeInstrument({ ticker: 'ABC', exchange: 'TSX', currency: 'CAD' }));
    expect(nyse).not.toBe(tsx);
    expect(timeframeConfig('1D').interval).toBe('5m');
    expect(timeframeConfig('10Y').interval).toBe('1mo');
  });

  it('attaches purchases to existing historical bars without changing candle prices', () => {
    const chartBars = [{ time: 100, open: 1, high: 2, low: 1, close: 2 }, { time: 200, open: 2, high: 3, low: 2, close: 3 }];
    const markers = markersForBuys([{ boughtAt: new Date(150_000).toISOString(), sharesBought: 0.1 }], chartBars);
    expect(markers).toHaveLength(1);
    expect(markers[0].time).toBe(100);
    expect(chartBars[0].close).toBe(2);
  });

  it('labels providers explicitly', () => {
    expect(providerLabel('IBKR Relay', 'LIVE')).toBe('IBKR Relay • LIVE');
    expect(providerLabel('Yahoo', 'FALLBACK')).toBe('Yahoo • FALLBACK');
  });
});
