function compactShares(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '-';
  return amount.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

export function CalendarPage(props) {
  const { buyLog, calendarFilteredDays, calendarMonth, calendarMonthTotal, calendarTickerFilter, calendarView, formatDate, money, monthLabel, setCalendarMonth, setCalendarTickerFilter, setCalendarView, setSelectedBuyLogRow, setSelectedCalendarDay, tickerOptions } = props;
  return (
<main className="layout"><section className="panel calendarPanel">
            <div className="sectionHead">
              <div>
                <h2>Buy Calendar</h2>
                <span>Recorded buys shown by purchase date. Weeks start Monday.</span>
              </div>
              <div className="actions">
                <button
                  className="secondary"
                  onClick={() => setCalendarMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))}
                >
                  Previous
                </button>
                <button className="secondary" onClick={() => setCalendarMonth(new Date())}>Today</button>
                <select value={calendarTickerFilter} onChange={(event) => setCalendarTickerFilter(event.target.value)}>
                  <option value="all">All tickers</option>
                  {tickerOptions.map((ticker) => <option key={ticker} value={ticker}>{ticker}</option>)}
                </select>
                <button className={calendarView === 'calendar' ? '' : 'secondary'} onClick={() => setCalendarView('calendar')}>Calendar</button>
                <button className={calendarView === 'timeline' ? '' : 'secondary'} onClick={() => setCalendarView('timeline')}>Timeline</button>
                <button
                  className="secondary"
                  onClick={() => setCalendarMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))}
                >
                  Next
                </button>
              </div>
            </div>
            <div className="calendarSummary">
              <strong>{monthLabel(calendarMonth)}</strong>
              <span>{calendarFilteredDays.filter((day) => day.inMonth).reduce((sum, day) => sum + day.buys.length, 0)} executions</span>
              <span>{money(calendarMonthTotal)} total CAD</span>
            </div>
            {calendarView === 'timeline' ? (
              <div className="activityList">
                {calendarFilteredDays.flatMap((day) => day.buys.map((buy) => ({ ...buy, dayKey: day.key }))).map((buy) => (
                  <button key={buy.id} type="button" className="activityItem" onClick={() => setSelectedBuyLogRow(buy)}>
                    <strong>{buy.ticker}</strong>
                    <span>{formatDate(buy.boughtAt)}</span>
                    <span>{compactShares(buy.sharesBought)} sh · {money(buy.totalCadCost)}</span>
                  </button>
                ))}
              </div>
            ) : (
            <div className="calendarGrid" role="table" aria-label="Buy calendar">
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
                <div key={day} className="calendarWeekday" role="columnheader">{day}</div>
              ))}
              {calendarFilteredDays.map((day) => (
                <div
                  key={day.key}
                  className={`calendarDay ${day.inMonth ? '' : 'outsideMonth'} ${day.isToday ? 'todayCell' : ''}`}
                  role="cell"
                  onClick={() => day.buys.length > 0 && setSelectedCalendarDay(day)}
                >
                  <div className="calendarDateLine">
                    <strong>{day.date.getDate()}</strong>
                    {day.buys.length > 0 && <span>{day.buys.length} · {money(day.totalCAD)}</span>}
                  </div>
                  <div className="calendarBuys">
                    {day.buys.map((buy) => (
                      <div key={buy.id} className="calendarBuy">
                        <strong>{buy.ticker}</strong>
                        <span>{compactShares(buy.sharesBought)} sh</span>
                        <span>{money(buy.totalCadCost)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            )}
            {buyLog.length === 0 && <div className="emptyState">No buys recorded yet.</div>}
          </section></main>
  );
}
