export function isLimitOrder(order) {
  return String(order?.orderType || '').toUpperCase() === 'LIMIT';
}

function marketValue(market, field) {
  if (market && typeof market === 'object') return Number(market[field]);
  return field === 'lastPrice' ? Number(market) : NaN;
}

export function isLimitPriceReached(order, market) {
  if (!isLimitOrder(order)) return false;
  const limitPrice = Number(order.limitPrice);
  const side = String(order.orderSide || 'BUY').toUpperCase();
  const price = marketValue(market, side === 'SELL' ? 'sessionHigh' : 'sessionLow');
  const currentPrice = marketValue(market, 'lastPrice');
  const observedPrice = Number.isFinite(price) && price > 0 ? price : currentPrice;
  if (!Number.isFinite(limitPrice) || limitPrice <= 0 || !Number.isFinite(observedPrice) || observedPrice <= 0) return false;
  return side === 'SELL'
    ? observedPrice >= limitPrice
    : observedPrice <= limitPrice;
}

export function getLimitOrderState(order, currentPrice) {
  if (String(order?.status || '').toUpperCase() === 'CANCELLED') return 'cancelled';
  if (String(order?.status || '').toUpperCase() === 'READY') return 'ready';
  if (!isLimitOrder(order)) return 'pending';
  if (isLimitPriceReached(order, currentPrice)) return 'ready';
  return 'waiting';
}
