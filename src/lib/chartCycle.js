const FOUR_YEAR_CYCLE = Object.freeze({
  id: 'four-year-cycle',
  name: '4-Year Cycle',
  anchorReferenceYear: 2014,
  periodYears: 4,
  bearishDuration: 'calendar-year',
});

function isBearishYear(year, cycle = FOUR_YEAR_CYCLE) {
  const numericYear = Number(year);
  const anchorReferenceYear = Number(cycle.anchorReferenceYear);
  const periodYears = Number(cycle.periodYears);
  if (!Number.isInteger(numericYear) || !Number.isInteger(anchorReferenceYear) || !Number.isInteger(periodYears) || periodYears <= 0) return false;
  const remainder = ((numericYear - anchorReferenceYear) % periodYears + periodYears) % periodYears;
  return remainder === 0;
}

const isBearishCycleYear = isBearishYear;

function utcYearStart(year) {
  return Math.floor(Date.UTC(year, 0, 1) / 1000);
}

function cycleBands(fromTime, toTime, cycle = FOUR_YEAR_CYCLE) {
  const from = Number(fromTime);
  const to = Number(toTime);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return [];
  const firstYear = new Date(from * 1000).getUTCFullYear();
  const lastYear = new Date(to * 1000).getUTCFullYear();
  const bands = [];
  for (let year = firstYear; year <= lastYear; year += 1) {
    if (!isBearishYear(year, cycle)) continue;
    bands.push({ year, from: utcYearStart(year), to: utcYearStart(year + 1) });
  }
  return bands;
}

function lowerBound(sortedTimes, target) {
  let low = 0;
  let high = sortedTimes.length;
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    if (sortedTimes[middle] < target) low = middle + 1;
    else high = middle;
  }
  return low;
}

function cycleBandsForTimestamps(timestamps, { includeFuture = false, futureYears = 12, cycle = FOUR_YEAR_CYCLE } = {}) {
  const sortedTimes = [...new Set((timestamps || []).map(Number).filter((time) => Number.isInteger(time) && time > 0))].sort((left, right) => left - right);
  if (!sortedTimes.length) return [];
  const firstYear = new Date(sortedTimes[0] * 1000).getUTCFullYear();
  const lastRealYear = new Date(sortedTimes.at(-1) * 1000).getUTCFullYear();
  const lastYear = includeFuture ? lastRealYear + Math.max(0, Number(futureYears) || 0) : lastRealYear;
  const bands = [];
  for (let year = firstYear; year <= lastYear; year += 1) {
    if (!isBearishYear(year, cycle)) continue;
    const yearStart = utcYearStart(year);
    const nextYearStart = utcYearStart(year + 1);
    const firstIndex = lowerBound(sortedTimes, yearStart);
    const nextYearIndex = lowerBound(sortedTimes, nextYearStart);
    const hasRealBars = firstIndex < sortedTimes.length && sortedTimes[firstIndex] < nextYearStart;
    if (hasRealBars) {
      const nextTimestamp = sortedTimes[nextYearIndex];
      const nextTimestampYear = nextTimestamp == null ? null : new Date(nextTimestamp * 1000).getUTCFullYear();
      const hasNextYearBoundary = nextTimestampYear === year + 1;
      bands.push({
        year,
        from: sortedTimes[firstIndex],
        to: hasNextYearBoundary ? nextTimestamp : sortedTimes[nextYearIndex - 1],
        endInclusive: !hasNextYearBoundary,
        isFuture: false,
      });
    } else if (includeFuture && year > lastRealYear) {
      bands.push({ year, from: yearStart, to: nextYearStart, endInclusive: false, isFuture: true });
    }
  }
  return bands;
}

module.exports = { FOUR_YEAR_CYCLE, isBearishYear, isBearishCycleYear, utcYearStart, cycleBands, cycleBandsForTimestamps, lowerBound };
