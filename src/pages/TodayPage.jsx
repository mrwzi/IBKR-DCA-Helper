export function TodayPage(props) {
  const { MoreVertical, Plus, boughtTodayTickers, buyLogReport, buyRowsByTicker, deleteHolding, formatChange, formatLastPrice, formatSource, formatStatus, formatTodayStatus, hasHoldings, holdingActionId, holdings, isCashPool, isDipRanking, isUntrustedRow, money, openAddHolding, openEditHolding, percent, plan, portfolioValue, reconciliationIssues, rows, setActiveTab, setHoldingActionId, settings, shares, sinceLastBuyByTicker } = props;
  return (
    <main className="layout todayLayout">
<section className="panel summaryPanel">
            <div className="sectionHead">
              <h2>Today</h2>
              <span>Portfolio and buy decision overview</span>
            </div>
            <div className="summaryGrid">
              <div><span>Portfolio value</span><strong>{money(portfolioValue)}</strong></div>
              <div><span>Cash available</span><strong>{money(plan?.cashAvailableCAD ?? settings?.dipCashAvailableCAD)}</strong></div>
              <div><span>Today’s P/L</span><strong className={buyLogReport.dailyPLCAD >= 0 ? 'gainText' : 'lossText'}>{money(buyLogReport.dailyPLCAD)}</strong></div>
              <div><span>Total P/L</span><strong className={buyLogReport.displayedNetPLAfterFeesCAD >= 0 ? 'gainText' : 'lossText'}>{money(buyLogReport.displayedNetPLAfterFeesCAD)}</strong></div>
              <button type="button" className="summaryCard reconciliationCard" onClick={() => setActiveTab('reports')}>
                <span>Broker data check</span>
                <strong className={reconciliationIssues === 0 ? 'gainText' : 'warningText'}>{reconciliationIssues === 0 ? 'App and IBKR match' : `${reconciliationIssues} holdings differ`}</strong>
                <small>Compares saved IBKR shares and average prices. Open Reports for details.</small>
              </button>
            </div>
          </section>

          <section className="panel planPanel">
            <div className="sectionHead">
              <h2>DCA suggestions</h2>
              <span>Cash available: {money(plan?.cashAvailableCAD)}</span>
            </div>
            <div className="planNote">
              <span>Stale prices are shown for reference and never used for buy decisions.</span>
            </div>
            <table>
              <thead>
                {isDipRanking ? (
                  <tr>
                    <th>Ticker</th>
                    <th>Current price</th>
                    <th>Today’s move</th>
                    <th title="Current price compared with your most recent recorded buy price for this ticker.">Since last buy %</th>
                    <th>Details</th>
                    <th>Previous close</th>
                    <th>Source</th>
                  </tr>
                ) : isCashPool ? (
                  <tr>
                    <th>Symbol</th>
                    <th>Action</th>
                    <th>Last price</th>
                    <th>Previous close</th>
                    <th>Change $ / %</th>
                    <th>Buy size shares</th>
                    <th>Suggested shares</th>
                    <th>Estimated CAD cost</th>
                    <th>Cash after</th>
                    <th>Source</th>
                    <th>Status</th>
                    <th>Reason</th>
                    <th></th>
                  </tr>
                ) : (
                  <tr>
                    <th>Symbol</th>
                    <th>Action</th>
                    <th>Price</th>
                    <th>Prev close</th>
                    <th>Change $ / %</th>
                    <th>Value CAD</th>
                    <th>Gap CAD</th>
                    <th>Source</th>
                    <th>Status</th>
                    <th>Reason</th>
                  </tr>
                )}
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={isDipRanking ? 7 : isCashPool ? 13 : 10} className="emptyCell">{hasHoldings ? 'No enabled holdings to calculate.' : 'Add your first stock or ETF to begin.'}</td>
                  </tr>
                ) : (
                  rows.map((row) => isDipRanking ? (
                    <tr key={row.id}>
                      <td>{row.ticker}</td>
                      <td>{formatLastPrice(row)}</td>
                      <td>{isUntrustedRow(row) ? <span className="staleText">Not trusted</span> : percent(row.changePercent)}</td>
                      <td className={(sinceLastBuyByTicker.get(row.ticker)?.percent ?? 0) >= 0 ? 'gainText' : 'lossText'}>{percent(sinceLastBuyByTicker.get(row.ticker)?.percent)}</td>
                      <td>
                        <details>
                          <summary>{formatTodayStatus(row, sinceLastBuyByTicker.get(row.ticker), boughtTodayTickers.has(String(row.ticker || '').toUpperCase()))}</summary>
                          <div className="helpText">Normal move: {row.normalMovePercent == null ? 'Unavailable' : percent(row.normalMovePercent)} · Move score: {row.moveScore == null ? '-' : `${Number(row.moveScore).toFixed(2)}x`}</div>
                        </details>
                      </td>
                      <td className={isUntrustedRow(row) ? 'staleText' : ''}>{money(row.previousClose)}</td>
                      <td>{formatSource(row)}</td>
                    </tr>
                  ) : isCashPool ? (
                    <tr key={row.id}>
                      <td>{row.ticker}</td>
                      <td><span className={`badge ${row.action.toLowerCase()}`}>{row.action}</span></td>
                      <td>{formatLastPrice(row)}</td>
                      <td className={isUntrustedRow(row) ? 'staleText' : ''}>{money(row.previousClose)}</td>
                      <td>{formatChange(row)}</td>
                      <td>{shares(row.buySizeShares)}</td>
                      <td>{shares(row.suggestedShares)}</td>
                      <td>{money(row.estimatedCostCAD)}</td>
                      <td>{money(row.cashRemainingAfterBuyCAD)}</td>
                      <td>{formatSource(row)}</td>
                      <td>{formatStatus(row)}</td>
                      <td>{row.reason}</td>
                      <td></td>
                    </tr>
                  ) : (
                    <tr key={row.id}>
                      <td>{row.ticker}</td>
                      <td><span className={`badge ${row.action.toLowerCase()}`}>{row.action}</span></td>
                      <td>{formatLastPrice(row)}</td>
                      <td className={isUntrustedRow(row) ? 'staleText' : ''}>{money(row.previousClose)}</td>
                      <td>{formatChange(row)}</td>
                      <td>{money(row.currentValueCAD)}</td>
                      <td>{money(row.gapToTargetCAD)}</td>
                      <td>{formatSource(row)}</td>
                      <td>{formatStatus(row)}</td>
                      <td>{row.reason}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </section>

          <section className="panel portfolioPanel">
            <div className="sectionHead">
              <h2>Portfolio</h2>
              <div className="actions">
                <span>{holdings.length} holdings</span>
                <button onClick={openAddHolding}><Plus size={16} /> Add stock</button>
              </div>
            </div>
            {holdings.length === 0 ? (
              <div className="emptyState">Add your first stock or ETF to begin.</div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Symbol</th>
                    <th>Name</th>
                    <th>Price symbol</th>
                    <th>Currency</th>
                    <th>Shares</th>
                    <th>Current value</th>
                    <th>Avg cost</th>
                    <th>P/L</th>
                    <th>Weight</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {holdings.map((holding) => {
                    const reportRow = buyRowsByTicker.get(holding.ticker);
                    const weight = portfolioValue > 0 && reportRow ? (reportRow.currentValueCAD / portfolioValue) * 100 : null;
                    return (
                    <tr key={holding.id}>
                      <td>{holding.ticker}</td>
                      <td>{holding.name}</td>
                      <td>{holding.priceSymbol}</td>
                      <td>{holding.currency}</td>
                      <td>{shares(reportRow?.shares ?? holding.sharesOwned)}</td>
                      <td>{reportRow ? money(reportRow.currentValueCAD) : '-'}</td>
                      <td>{reportRow ? `${money(reportRow.avgBuyPriceTickerCurrency)} ${reportRow.priceCurrency}` : '-'}</td>
                      <td className={!reportRow || reportRow.netPLAfterFeesCAD >= 0 ? 'gainText' : 'lossText'}>{reportRow ? money(reportRow.netPLAfterFeesCAD) : '-'}</td>
                      <td>{weight == null ? '-' : percent(weight)}</td>
                      <td>{holding.enabled ? <span className="badge buy">Enabled</span> : <span className="badge wait">Disabled</span>}</td>
                      <td className="rowActions">
                        <button type="button" className="secondary iconButton" title="Holding actions" onClick={() => setHoldingActionId((current) => (current === holding.id ? null : holding.id))}>
                          <MoreVertical size={15} />
                        </button>
                        {holdingActionId === holding.id && (
                          <div className="rowMenu">
                            <button type="button" onClick={() => { setHoldingActionId(null); openEditHolding(holding); }}>Edit</button>
                            <button type="button" className="danger" onClick={() => { setHoldingActionId(null); deleteHolding(holding); }}>Delete</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );})}
                </tbody>
              </table>
            )}
          </section>
    </main>
  );
}
