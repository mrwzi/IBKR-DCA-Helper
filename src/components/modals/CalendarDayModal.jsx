export function CalendarDayModal(props) {
  const { formatDate, money, selectedCalendarDay, setSelectedBuyLogRow, setSelectedCalendarDay, shares } = props;
  return (
<div className="modalBackdrop">
          <section className="modal">
            <h2>{selectedCalendarDay.key} trades</h2>
            <p className="helpText">{selectedCalendarDay.buys.length} executions · {money(selectedCalendarDay.totalCAD)} total CAD</p>
            <div className="activityList">
              {selectedCalendarDay.buys.map((buy) => (
                <button key={buy.id} type="button" className="activityItem" onClick={() => { setSelectedBuyLogRow(buy); setSelectedCalendarDay(null); }}>
                  <strong>{buy.ticker}</strong>
                  <span>{formatDate(buy.boughtAt)}</span>
                  <span>{shares(buy.sharesBought)} sh · {money(buy.totalCadCost)}</span>
                </button>
              ))}
            </div>
            <div className="formActions">
              <button type="button" className="secondary" onClick={() => setSelectedCalendarDay(null)}>Close</button>
            </div>
          </section>
        </div>
  );
}
