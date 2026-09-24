export function ReportsPage(props) {
  const { buyLogReport, money, percent, portfolioValue, shares, usdCommission } = props;
  return (
<main className="layout"><section className="panel">
            <div className="sectionHead">
              <h2>Reports</h2>
              <span>Portfolio metrics and activity from Buy Log records</span>
            </div>
            <h3>Portfolio</h3>
            <div className="metricGrid">
              <div><span>Current value CAD</span><strong>{money(buyLogReport.currentValueCAD)}</strong></div>
              <div><span>Total invested CAD</span><strong>{money(buyLogReport.totalCadSpent)}</strong></div>
              <div><span>Unrealized P/L before fees CAD</span><strong className={buyLogReport.unrealizedBeforeFeesCAD >= 0 ? 'gainText' : 'lossText'}>{money(buyLogReport.unrealizedBeforeFeesCAD)}</strong></div>
              <div><span title="Matches the sum of the displayed per-ticker P/L values below.">Net P/L after fees CAD ⓘ</span><strong className={buyLogReport.displayedNetPLAfterFeesCAD >= 0 ? 'gainText' : 'lossText'}>{money(buyLogReport.displayedNetPLAfterFeesCAD)}</strong></div>
              <div><span>Net P/L after fees %</span><strong className={buyLogReport.netPLAfterFeesCAD >= 0 ? 'gainText' : 'lossText'}>{percent(buyLogReport.netPLAfterFeesPercent)}</strong></div>
              <div><span>Total shares bought</span><strong>{buyLogReport.totalSharesBoughtText}</strong></div>
              <div><span>Daily P/L CAD (approx.)</span><strong className={buyLogReport.dailyPLCAD >= 0 ? 'gainText' : 'lossText'}>{money(buyLogReport.dailyPLCAD)}</strong></div>
            </div>
            <h3>Activity</h3>
            <div className="metricGrid">
              <div><span>Total investment executions</span><strong>{buyLogReport.totalExecutions}</strong></div>
              <div><span>USD commissions</span><strong>{usdCommission(buyLogReport.totalUsdCommissions)}</strong></div>
              <div><span>Fees paid CAD estimate</span><strong>{money(buyLogReport.totalFees)}</strong></div>
              <div><span>Buys today</span><strong>{buyLogReport.buysToday}</strong></div>
              <div><span>Buys this week</span><strong>{buyLogReport.buysThisWeek}</strong></div>
              <div><span>Buys this month</span><strong>{buyLogReport.buysThisMonth}</strong></div>
              <div><span>Most bought ticker</span><strong>{buyLogReport.mostBoughtTicker}</strong></div>
              <div><span>Best P/L ticker</span><strong>{buyLogReport.bestProfitTicker}</strong></div>
            </div>
            <div className="chartGrid">
              <div className="miniChart">
                <strong>Portfolio value over time</strong>
                <div className="barTrack"><span style={{ width: `${Math.min(100, Math.max(0, buyLogReport.currentValueCAD / Math.max(buyLogReport.totalCadSpent, 1) * 100))}%` }} /></div>
                <small>Current value compared with invested CAD.</small>
              </div>
              <div className="miniChart">
                <strong>Contributions vs P/L</strong>
                <div className="barTrack split"><span style={{ width: `${Math.min(100, Math.max(0, buyLogReport.totalCadSpent / Math.max(buyLogReport.totalCadSpent + Math.abs(buyLogReport.netPLAfterFeesCAD), 1) * 100))}%` }} /><i style={{ width: `${Math.min(100, Math.max(0, Math.abs(buyLogReport.netPLAfterFeesCAD) / Math.max(buyLogReport.totalCadSpent + Math.abs(buyLogReport.netPLAfterFeesCAD), 1) * 100))}%` }} /></div>
                <small>Invested CAD plus current P/L.</small>
              </div>
              <div className="miniChart">
                <strong>Portfolio allocation</strong>
                <div className="allocationBars">
                  {buyLogReport.tickerBreakdown.map((row) => (
                    <span key={row.ticker} title={`${row.ticker} ${money(row.currentValueCAD)}`} style={{ width: `${portfolioValue > 0 ? Math.max(4, (row.currentValueCAD / portfolioValue) * 100) : 0}%` }}>{row.ticker}</span>
                  ))}
                </div>
                <small>Based on current market prices.</small>
              </div>
            </div>
            <p className="helpText">Daily P/L uses today's move from previous close. Since last buy % compares current price to your most recent recorded buy for that ticker. IBKR position fields are entered manually from your IBKR Positions tab — they're not fetched automatically. Treat your actual IBKR account as the source of truth; these fields exist only to help you spot and reconcile broker rounding, fees, and cost-basis differences against the app's tracked numbers.</p>
            <div className="reportsTableWrap">
            <table>
              <thead>
                <tr>
                  <th>Ticker</th>
                  <th>App shares</th>
                  <th>IBKR shares</th>
                  <th>Share diff</th>
                  <th>Current price</th>
                  <th>Current value CAD</th>
                  <th>Cost before fees CAD</th>
                  <th>Fees paid CAD estimate</th>
                  <th>USD commissions</th>
                  <th>App total cost CAD incl. fees</th>
                  <th>Daily P/L CAD approx.</th>
                  <th>Unrealized before fees CAD</th>
                  <th title="Each row is rounded independently for display, so rows may not appear to sum exactly to the total above — that's rounding, not an error.">Net P/L after fees CAD ⓘ</th>
                  <th>Net P/L %</th>
                  <th>Since last buy %</th>
                  <th>App avg fill price USD</th>
                  <th>IBKR avg price USD</th>
                  <th>Avg price diff</th>
                  <th>IBKR cost basis USD</th>
                  <th>IBKR cost basis CAD estimate</th>
                  <th>Cost basis diff CAD</th>
                  <th>Avg cost/share CAD incl. fees</th>
                </tr>
              </thead>
              <tbody>
                {buyLogReport.tickerBreakdown.length === 0 ? (
                  <tr><td colSpan="21" className="emptyCell">No buy log records yet.</td></tr>
                ) : (
                  buyLogReport.tickerBreakdown.map((row) => (
                    <tr key={row.ticker}>
                      <td>{row.ticker}</td>
                      <td>{shares(row.shares)}</td>
                      <td>{row.ibkrPositionShares == null ? 'Not entered' : shares(row.ibkrPositionShares)}</td>
                      <td className={row.shareDifference == null || Math.abs(row.shareDifference) < 0.00001 ? '' : 'warningText'}>{row.shareDifference == null ? '-' : Number(row.shareDifference).toFixed(6)}</td>
                      <td>{row.currentPrice == null ? '-' : `${money(row.currentPrice)} ${row.priceCurrency}`}</td>
                      <td>{money(row.currentValueCAD)}</td>
                      <td>{money(row.costBeforeFees)}</td>
                      <td>{money(row.fees)}</td>
                      <td>{usdCommission(row.usdCommissions)}</td>
                      <td>{money(row.totalCostAfterFees)}</td>
                      <td className={row.dailyPLCAD >= 0 ? 'gainText' : 'lossText'}>{money(row.dailyPLCAD)}</td>
                      <td className={row.unrealizedBeforeFeesCAD >= 0 ? 'gainText' : 'lossText'}>{money(row.unrealizedBeforeFeesCAD)}</td>
                      <td className={row.netPLAfterFeesCAD >= 0 ? 'gainText' : 'lossText'}>{money(row.netPLAfterFeesCAD)}</td>
                      <td className={row.netPLAfterFeesCAD >= 0 ? 'gainText' : 'lossText'}>{percent(row.netPLPercent)}</td>
                      <td className={row.sinceLastBuyPercent == null || row.sinceLastBuyPercent >= 0 ? 'gainText' : 'lossText'}>{percent(row.sinceLastBuyPercent)}</td>
                      <td>{money(row.avgBuyPriceTickerCurrency)} {row.priceCurrency}</td>
                      <td>{row.ibkrAvgPrice == null ? 'Not entered' : `${money(row.ibkrAvgPrice)} ${row.priceCurrency}`}</td>
                      <td className={row.avgPriceDifference == null || Math.abs(row.avgPriceDifference) < 0.01 ? '' : 'warningText'}>{row.avgPriceDifference == null ? '-' : `${money(row.avgPriceDifference)} ${row.priceCurrency}`}</td>
                      <td>{row.ibkrCostBasis == null ? 'Not entered' : `${money(row.ibkrCostBasis)} ${row.priceCurrency}`}</td>
                      <td>{row.ibkrCostBasisCADEstimate == null ? 'Not entered' : money(row.ibkrCostBasisCADEstimate)}</td>
                      <td className={row.costBasisDifference == null || Math.abs(row.costBasisDifference) < 0.01 ? '' : 'warningText'}>{row.costBasisDifference == null ? '-' : money(row.costBasisDifference)}</td>
                      <td>{money(row.avgCostShareCADInclFees)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            </div>
          </section></main>
  );
}
