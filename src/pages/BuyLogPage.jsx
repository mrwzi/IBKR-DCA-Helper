import { getLimitOrderState } from '../lib/orderLogic.js';

export function BuyLogPage(props) {
  const { Edit3, Trash2, buyCadFilter, buyDateFilter, buyLog, buySearch, buySort, buySourceFilter, buySourceLabel, buyTickerFilter, cancelPendingOrder, confirmPendingOrder, currentPriceByTicker, deleteBuyLogRecord, deletePendingOrder, editBuyLog, filteredBuyLog, formatCadCostStatus, formatDate, money, openPendingOrder, pendingOrders, setBuyCadFilter, setBuyDateFilter, setBuySearch, setBuySort, setBuySourceFilter, setBuyTickerFilter, setSelectedBuyLogRow, shares, sourceBadgeClass, tickerOptions } = props;
  const activePendingCount = pendingOrders.filter((order) => String(order.status || '').toUpperCase() !== 'CANCELLED').length;
  return (
<main className="layout">
          {pendingOrders.length > 0 && (
            <section className="panel pendingOrdersPanel">
              <div className="sectionHead">
                <div>
                  <h2>Pending orders</h2>
                  <span>Saved previews only—these do not affect shares, reports, or performance.</span>
                </div>
                <span>{activePendingCount} active{pendingOrders.length - activePendingCount ? ` · ${pendingOrders.length - activePendingCount} cancelled` : ''}</span>
              </div>
              <div className="pendingOrderList">
                {pendingOrders.map((order) => {
                  const isLimit = String(order.orderType || '').toUpperCase() === 'LIMIT';
                  const isCancelled = String(order.status || '').toUpperCase() === 'CANCELLED';
                  const side = String(order.orderSide || 'BUY').toUpperCase();
                  const market = currentPriceByTicker?.[order.ticker] || {};
                  const currentPrice = Number(market.lastPrice);
                  const sessionExtreme = Number(side === 'SELL' ? market.sessionHigh : market.sessionLow);
                  const hasCurrentPrice = Number.isFinite(currentPrice) && currentPrice > 0;
                  const hasSessionExtreme = Number.isFinite(sessionExtreme) && sessionExtreme > 0;
                  const limitReady = getLimitOrderState(order, market) === 'ready';
                  const statusTitle = isCancelled
                    ? 'Cancelled in IBKR'
                    : limitReady
                      ? 'Target reached'
                      : side === 'BUY'
                        ? 'Waiting — target below market'
                        : 'Waiting — target above market';
                  const marketDetail = !hasCurrentPrice
                    ? 'Price unavailable — refresh needed'
                    : limitReady
                      ? `Target reached using ${hasSessionExtreme ? `today’s ${side === 'BUY' ? 'low' : 'high'}` : 'the latest quote'}. Verify the fill in IBKR.`
                      : hasSessionExtreme
                        ? `Now ${money(currentPrice)} · today’s ${side === 'BUY' ? 'low' : 'high'} ${money(sessionExtreme)}`
                        : `Now ${money(currentPrice)} ${order.limitCurrency}`;
                  return (
                    <article key={order.id} className={`pendingOrderCard${isLimit ? ' limitOrderCard' : ''}`}>
                      <div className="pendingOrderIdentity">
                        <span className={`badge ${isCancelled ? 'skip' : isLimit ? (limitReady ? 'buy' : 'wait') : 'skip'}`}>{isCancelled ? 'Cancelled' : isLimit ? `Limit ${side}` : 'Pending'}</span>
                        <strong>{order.ticker}</strong>
                      </div>
                      <div className="pendingOrderMetric"><span>{isLimit ? 'Order amount' : 'Planned amount'}</span><strong>{order.mode === 'shares' ? `${shares(order.sharesBought)} shares` : order.cashPaidAmount == null ? '-' : `${money(order.cashPaidAmount)} ${order.cashPaidCurrency}`}</strong></div>
                      {isLimit ? (
                        <div className="pendingOrderMetric"><span>Limit target</span><strong>{money(order.limitPrice)} {order.limitCurrency}</strong><small>{marketDetail}</small></div>
                      ) : (
                        <div className="pendingOrderMetric"><span>Estimated fee</span><strong>{order.estimatedFeeAmount == null ? '-' : `${money(order.estimatedFeeAmount)} ${order.feeCurrency}`}</strong></div>
                      )}
                      {isLimit && order.estimatedFeeAmount != null && <div className="pendingOrderMetric"><span>Estimated fee</span><strong>{money(order.estimatedFeeAmount)} {order.feeCurrency}</strong></div>}
                      <div className={`pendingOrderStatus ${limitReady && !isCancelled ? 'isReady' : ''}`}><span>Status</span><strong>{isLimit ? statusTitle : formatDate(order.createdAt)}</strong>{isLimit && <small>{isCancelled ? `Marked ${formatDate(order.cancelledAt || order.updatedAt)}` : limitReady ? 'Price tracking complete — confirm the actual broker fill.' : 'Automatic monitoring is active while DCA Helper is open.'}</small>}</div>
                      <div className="pendingOrderControls">
                        <div className="actions">
                          {!isCancelled && ((!isLimit || side === 'BUY') ? <button type="button" onClick={() => isLimit ? confirmPendingOrder(order) : openPendingOrder(order)}>{isLimit ? 'Confirm filled' : 'Finalize filled trade'}</button> : <button type="button" className="secondary" disabled title="Sell fills are recorded in IBKR; this app currently records completed buys.">Record sell in IBKR</button>)}
                          {!isCancelled && isLimit && <button type="button" className="secondary" onClick={() => openPendingOrder(order)}>Enter exact fill</button>}
                          {!isCancelled && isLimit && <button type="button" className="secondary" onClick={() => cancelPendingOrder(order)}>Mark cancelled</button>}
                          <button type="button" className="secondary danger" onClick={() => deletePendingOrder(order)}>{isCancelled ? 'Delete history' : 'Delete draft'}</button>
                        </div>
                        {isLimit && order.note && <small className="pendingOrderNote">{order.note}</small>}
                        {isLimit && order.screenshotDataUrl && <details className="pendingOrderEvidence"><summary>Order preview</summary><a href={order.screenshotDataUrl} target="_blank" rel="noreferrer"><img className="pendingOrderScreenshot" src={order.screenshotDataUrl} alt="Limit order preview screenshot" /></a><small>IBKR preview — not a completed fill</small></details>}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          )}
          <section className="panel">
            <div className="sectionHead">
              <h2>Buy Log</h2>
              <div className="actions">
                <span>{buyLog.length} records</span>
              </div>
            </div>
            <div className="filterBar">
              <input placeholder="Search ticker, note, trade ID" value={buySearch} onChange={(event) => setBuySearch(event.target.value)} />
              <select value={buyTickerFilter} onChange={(event) => setBuyTickerFilter(event.target.value)}>
                <option value="all">All tickers</option>
                {tickerOptions.map((ticker) => <option key={ticker} value={ticker}>{ticker}</option>)}
              </select>
              <input type="date" value={buyDateFilter} onChange={(event) => setBuyDateFilter(event.target.value)} />
              <select value={buySourceFilter} onChange={(event) => setBuySourceFilter(event.target.value)}>
                <option value="all">All sources</option>
                <option value="ibkr">IBKR</option>
                <option value="screenshot">Screenshot</option>
                <option value="manual">Manual</option>
              </select>
              <select value={buyCadFilter} onChange={(event) => setBuyCadFilter(event.target.value)}>
                <option value="all">Exact + estimated CAD</option>
                <option value="exact">CAD exact</option>
                <option value="estimated">CAD estimated</option>
                <option value="unavailable">CAD unavailable</option>
              </select>
              <select value={buySort} onChange={(event) => setBuySort(event.target.value)}>
                <option value="dateDesc">Newest first</option>
                <option value="dateAsc">Oldest first</option>
                <option value="ticker">Ticker</option>
                <option value="sharesDesc">Shares high to low</option>
                <option value="costDesc">Cost high to low</option>
              </select>
            </div>
            <div className="tableScroll">
            <table>
              <thead>
                <tr>
                  <th>Date/time</th>
                  <th>Ticker</th>
                  <th>Shares bought</th>
                  <th>Buy price</th>
                  <th>Price currency</th>
                  <th>CAD amount</th>
                  <th>CAD status</th>
                  <th>Commission</th>
                  <th>Total CAD cost</th>
                  <th>Note</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filteredBuyLog.length === 0 ? (
                  <tr><td colSpan="11" className="emptyCell">No buys recorded yet.</td></tr>
                ) : (
                  filteredBuyLog.map((row) => (
                    <tr key={row.id} className="clickableRow" onClick={() => setSelectedBuyLogRow(row)}>
                      <td>{formatDate(row.boughtAt)}</td>
                      <td>{row.ticker}</td>
                      <td>{shares(row.sharesBought)}</td>
                      <td>{money(row.buyPrice)}</td>
                      <td>{row.priceCurrency}</td>
                      <td>{row.cadCostStatus === 'unavailable' ? 'Unavailable' : money(row.cadAmount)}</td>
                      <td><span className={row.cadCostStatus === 'estimated' ? 'badge skip' : 'badge buy'}>CAD {formatCadCostStatus(row).toLowerCase()}</span></td>
                      <td>{row.commissionUsdText ? `$${Number(row.commissionUsdText).toFixed(8)} USD` : money(row.feeCAD)}</td>
                      <td>{money(row.totalCadCost)}</td>
                      <td>
                        <span className={sourceBadgeClass(row)}>{buySourceLabel(row)}</span>
                        {row.note && <span className="noteBadge">Note</span>}
                      </td>
                      <td className="rowActions">
                        <button onClick={(event) => { event.stopPropagation(); editBuyLog(row); }}><Edit3 size={15} /></button>
                        <button className="danger" onClick={(event) => { event.stopPropagation(); deleteBuyLogRecord(row); }}><Trash2 size={15} /></button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            </div>
          </section></main>
  );
}
