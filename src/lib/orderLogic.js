export function isLimitOrder(order) {
  return String(order?.orderType || '').toUpperCase() === 'LIMIT';
}

export function isLimitPriceReached(order, currentPrice) {
  if (!isLimitOrder(order)) return false;
  const limitPrice = Number(order.limitPrice);
  const price = Number(currentPrice);
  if (!Number.isFinite(limitPrice) || limitPrice <= 0 || !Number.isFinite(price) || price <= 0) return false;
  return String(order.orderSide || 'BUY').toUpperCase() === 'SELL'
    ? price >= limitPrice
    : price <= limitPrice;
}

export function getLimitOrderState(order, currentPrice) {
  if (String(order?.status || '').toUpperCase() === 'CANCELLED') return 'cancelled';
  if (!isLimitOrder(order)) return 'pending';
  if (isLimitPriceReached(order, currentPrice)) return 'ready';
  return 'waiting';
}
