export function TradeDetailsModal(props) {
  const { buySourceLabel, deleteBuyLogRecord, editBuyLog, formatCadCostStatus, formatDate, money, selectedBuyLogRow, setSelectedBuyLogRow, shares } = props;
  const isScreenshotEstimate = selectedBuyLogRow.source === 'screenshot-estimated';
  const plannedGross = Number(selectedBuyLogRow.sharesBought) * Number(selectedBuyLogRow.buyPrice);
  return (
<div className="modalBackdrop">
          <section className="modal">
            <h2>{selectedBuyLogRow.ticker} trade details</h2>
            <div className="detailGrid">
              <div><span>Broker trade ID</span><strong>{selectedBuyLogRow.ibkrTradeId || 'Not available'}</strong></div>
              <div><span>Source</span><strong>{buySourceLabel(selectedBuyLogRow)}</strong></div>
              <div><span>Date/time</span><strong>{formatDate(selectedBuyLogRow.boughtAt)}</strong></div>
              <div><span>Shares</span><strong>{(selectedBuyLogRow.source === 'ibkr' || selectedBuyLogRow.source === 'ibkr-activity') && selectedBuyLogRow.sharesBoughtText ? selectedBuyLogRow.sharesBoughtText : shares(selectedBuyLogRow.sharesBought)}</strong></div>
              <div><span>{isScreenshotEstimate ? 'Visible quote (estimate)' : 'Execution price'}</span><strong>{selectedBuyLogRow.buyPriceText || money(selectedBuyLogRow.buyPrice)} {selectedBuyLogRow.priceCurrency}</strong></div>
              <div><span>{isScreenshotEstimate ? 'Planned USD amount' : 'Exact USD gross'}</span><strong>{isScreenshotEstimate && Number.isFinite(plannedGross) ? `${money(plannedGross)} USD` : selectedBuyLogRow.grossUsdText || 'Not available'}</strong></div>
              <div><span>{isScreenshotEstimate ? 'Estimated commission CAD' : 'Exact USD commission'}</span><strong>{isScreenshotEstimate ? money(selectedBuyLogRow.feeCAD) : selectedBuyLogRow.commissionUsdText || 'Not available'}</strong></div>
              <div><span>{isScreenshotEstimate ? 'Estimated total CAD' : 'Exact USD all-in'}</span><strong>{isScreenshotEstimate ? money(selectedBuyLogRow.totalCadCost) : selectedBuyLogRow.allInUsdCostText || 'Not available'}</strong></div>
              <div><span>CAD status</span><strong>{formatCadCostStatus(selectedBuyLogRow)}</strong></div>
              <div><span>CAD cost</span><strong>{selectedBuyLogRow.cadCostStatus === 'unavailable' ? 'Unavailable' : money(selectedBuyLogRow.totalCadCost)}</strong></div>
              <div><span>OCR confidence</span><strong>{selectedBuyLogRow.source === 'screenshot-estimated' ? 'Preview values reviewed' : selectedBuyLogRow.source === 'screenshot' ? 'Review required at save' : 'N/A'}</strong></div>
              <div><span>Screenshot preview</span><strong>Not stored</strong></div>
            </div>
            <p className="helpText">{selectedBuyLogRow.note || 'No note.'}</p>
            <div className="formActions">
              <button type="button" onClick={() => { editBuyLog(selectedBuyLogRow); setSelectedBuyLogRow(null); }}>Edit</button>
              <button type="button" className="danger" onClick={() => { deleteBuyLogRecord(selectedBuyLogRow); setSelectedBuyLogRow(null); }}>Delete</button>
              <button type="button" className="secondary" onClick={() => setSelectedBuyLogRow(null)}>Close</button>
            </div>
          </section>
        </div>
  );
}
