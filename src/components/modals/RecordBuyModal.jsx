import { ScanLine } from 'lucide-react';

export function RecordBuyModal(props) {
  const { busy, buyForm, buyModal, buyPreview, buyScanInputRef, buyScanReview, buyScanStatus, buyScreenshotPreview, clearBuyScreenshotReview, handleBuyPaste, handleBuyScreenshot, holdings, markBought, money, recordTransmittedPreview, savePendingOrder, setBuyForm, setBuyModal, setBuyScreenshotPreview } = props;
  const finalizingPending = Boolean(buyModal?.pendingOrderId);
  const missingFillDetails = finalizingPending ? [
    !(Number(buyForm.sharesBought) > 0) ? 'filled shares' : null,
    !(Number(buyForm.buyPrice) > 0) ? 'fill price' : null,
    !buyForm.boughtAt ? 'fill date/time' : null,
  ].filter(Boolean) : [];
  return (
<div className="modalBackdrop">
          <form className="modal" onSubmit={markBought} onPaste={handleBuyPaste}>
            <h2>{buyForm.id ? 'Edit buy' : finalizingPending ? `Finish ${buyForm.ticker} buy` : 'Record buy'}</h2>
            {finalizingPending ? (
              <div className="scanBlocked pendingFinishGuide" role="status">
                <strong>Upload the completed IBKR trade screenshot.</strong>
                <span>Use the Orders or Trades view containing the Fill Price. Saved preview values will be merged automatically.</span>
                {missingFillDetails.length > 0 && <span>Still needed: {missingFillDetails.join(', ')}.</span>}
              </div>
            ) : (
              <p className="helpText">Upload or paste a brokerage screenshot, review every detected field, then save only after confirming. Manual entry still works if recognition fails.</p>
            )}
            <div className="scanRow">
              <input
                ref={buyScanInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={handleBuyScreenshot}
              />
              <button type="button" className="secondary" onClick={() => buyScanInputRef.current?.click()}>
                <ScanLine size={16} /> {finalizingPending ? 'Upload Filled trade with Fill Price' : buyScanReview ? 'Add another screenshot' : 'Upload brokerage screenshot'}
              </button>
              <div className="entryOptions">
                <span>Paste screenshot: Ctrl+V while this review window is open</span>
                <span>Upload screenshot: choose an image file</span>
                <span>Import IBKR file: use the existing corrected IBKR import/reconciliation path</span>
                <button type="button" className="entryOptionButton" onClick={clearBuyScreenshotReview}>Manual entry: click here to edit the fields directly</button>
              </div>
              <span className="helpText">Analysis may take a bit longer because the app validates the fields before showing them.</span>
              {buyScanStatus && <span className="helpText">{buyScanStatus}</span>}
            </div>
            {buyScanReview && (
              <div className="reviewLayout">
                {buyScreenshotPreview && <img className="screenshotPreview" src={buyScreenshotPreview} alt="Brokerage screenshot preview" />}
                <div className="reviewBox">
                  <div className="reviewHead">
                    <strong>Screenshot review</strong>
                    <span className={buyScanReview.transactionStatus === 'preview' ? 'infoText' : buyScanReview.saveBlocked || buyScanReview.needsReview ? 'warningText' : 'gainText'}>
                      {buyScanReview.transactionStatus === 'preview' ? 'Order preview' : buyScanReview.saveBlocked ? 'Cannot save' : buyScanReview.needsReview ? 'Needs review' : 'Ready to confirm'}
                    </span>
                  </div>
                  {buyScanReview.saveBlocked && (
                    <div className={buyScanReview.transactionStatus === 'preview' ? 'scanPreview' : 'scanBlocked'} role={buyScanReview.transactionStatus === 'preview' ? 'status' : 'alert'}>
                      <strong>{buyScanReview.transactionStatus === 'preview' ? 'IBKR order preview' : 'This is not a completed buy.'}</strong>
                      {buyScanReview.transactionStatus === 'preview' ? <span>This screen shows the order details before transmission. It does not contain a completed execution price or fill time.</span> : <span>{buyScanReview.blockingReasons?.[0]}</span>}
                      {buyScanReview.transactionStatus === 'preview' && <span>After IBKR shows <b>Filled</b>, upload that confirmation to record the actual trade.</span>}
                    </div>
                  )}
                  <div className="confidenceGrid">
                    {Object.entries(buyScanReview.fieldConfidence || {}).map(([name, info]) => (
                      <div key={name} className={Number(info.confidence) < 0.75 ? 'uncertainField' : ''}>
                        <span>{name}</span>
                        <b>{info.value == null || info.value === '' ? 'Not detected' : String(info.value)}</b>
                        <strong>{Math.round(Number(info.confidence || 0) * 100)}%</strong>
                      </div>
                    ))}
                  </div>
                  {[...(buyScanReview.blockingReasons || []).slice(1), ...(buyScanReview.warnings || []), ...(buyScanReview.conflicts || [])].length > 0 && (
                    <ul className="reviewWarnings">
                      {[...(buyScanReview.blockingReasons || []).slice(1), ...(buyScanReview.warnings || []), ...(buyScanReview.conflicts || [])].map((warning) => (
                        <li key={warning}>{warning}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
            {buyScanReview?.saveBlocked && (
              <div className="blockedScanActions">
                {buyScanReview.transactionStatus === 'preview' && buyScanReview.cashPaidAmount && buyScanReview.previewPriceEstimate && (
                  <button type="button" onClick={recordTransmittedPreview}>I clicked Transmit — record estimated buy</button>
                )}
                {buyScanReview.transactionStatus === 'preview' && buyForm.ticker && (buyForm.cashPaidAmount || buyForm.sharesBought) && (
                  <button type="button" className="secondary" onClick={savePendingOrder}>Keep as optional draft</button>
                )}
                <button type="button" className="secondary" onClick={() => { setBuyModal(null); setBuyScreenshotPreview(''); }}>Close</button>
                <button type="button" className="secondary" onClick={clearBuyScreenshotReview}>Discard screenshot and enter manually</button>
              </div>
            )}
            <div className={buyScanReview?.saveBlocked ? 'buyEntryFields blockedByScreenshot' : 'buyEntryFields'}>
            <label>
              Ticker
              {buyModal.manual || buyModal.global ? (
                <select
                  value={buyForm.holdingId}
                  onChange={(event) => {
                    const holding = holdings.find((item) => String(item.id) === event.target.value);
                    setBuyModal((current) => ({ ...current, holdingId: holding?.id || '', ticker: holding?.ticker || '' }));
                    setBuyForm((current) => ({
                      ...current,
                      holdingId: holding?.id || '',
                      ticker: holding?.ticker || '',
                      priceCurrency: holding?.currency || current.priceCurrency,
                      cashPaidCurrency: holding?.currency || current.cashPaidCurrency,
                    }));
                  }}
                >
                  {holdings.map((holding) => (
                    <option key={holding.id} value={holding.id}>{holding.ticker}</option>
                  ))}
                </select>
              ) : (
                <input value={buyModal.ticker} disabled />
              )}
            </label>
            <label>
              Company name from screenshot optional
              <input value={buyForm.companyName} onChange={(event) => setBuyForm((current) => ({ ...current, companyName: event.target.value }))} />
            </label>
            <div className="segmented">
              <button
                type="button"
                className={buyForm.mode === 'shares' ? 'active' : 'secondary'}
                onClick={() => setBuyForm((current) => ({ ...current, mode: 'shares' }))}
              >
                Shares mode
              </button>
              <button
                type="button"
                className={buyForm.mode === 'cash' ? 'active' : 'secondary'}
                onClick={() => setBuyForm((current) => ({ ...current, mode: 'cash' }))}
              >
                Cash amount mode
              </button>
            </div>
            <div className="two">
              {buyForm.mode === 'shares' ? (
                <label>
                  Shares bought
                  <input type="number" step="0.000001" value={buyForm.sharesBought} onChange={(event) => setBuyForm((current) => ({ ...current, sharesBought: event.target.value }))} />
                </label>
              ) : (
                <label>
                  Cash paid amount
                  <input type="number" step="0.01" value={buyForm.cashPaidAmount} onChange={(event) => setBuyForm((current) => ({ ...current, cashPaidAmount: event.target.value }))} />
                </label>
              )}
              <label>
                Buy price
                <input type="number" step="0.0001" value={buyForm.buyPrice} onChange={(event) => setBuyForm((current) => ({ ...current, buyPrice: event.target.value }))} />
              </label>
            </div>
            <div className="two">
              {buyForm.mode === 'cash' && (
                <label>
                  Cash paid currency
                  <select value={buyForm.cashPaidCurrency} onChange={(event) => setBuyForm((current) => ({ ...current, cashPaidCurrency: event.target.value }))}>
                    <option>USD</option>
                    <option>CAD</option>
                  </select>
                </label>
              )}
              <label>
                Buy price currency
                <select value={buyForm.priceCurrency} onChange={(event) => setBuyForm((current) => ({ ...current, priceCurrency: event.target.value }))}>
                  <option>USD</option>
                  <option>CAD</option>
                </select>
              </label>
              <label>
                Fee amount optional
                <input type="number" step="0.01" value={buyForm.feeAmount} onChange={(event) => setBuyForm((current) => ({ ...current, feeAmount: event.target.value }))} />
              </label>
            </div>
            <div className="two">
              <label>
                Fee currency
                <select value={buyForm.feeCurrency} onChange={(event) => setBuyForm((current) => ({ ...current, feeCurrency: event.target.value }))}>
                  <option>USD</option>
                  <option>CAD</option>
                </select>
              </label>
              <label>
                Date/time
                <input type="datetime-local" value={buyForm.boughtAt} onChange={(event) => setBuyForm((current) => ({ ...current, boughtAt: event.target.value }))} />
              </label>
            </div>
            <div className="two">
              <label>
                Broker trade ID optional
                <input value={buyForm.brokerTradeId} onChange={(event) => setBuyForm((current) => ({ ...current, brokerTradeId: event.target.value }))} />
              </label>
              <label>
                Visible total amount optional
                <input type="number" step="0.000001" value={buyForm.totalAmount} onChange={(event) => setBuyForm((current) => ({ ...current, totalAmount: event.target.value }))} />
              </label>
            </div>
            <div className="calcPreview">
              <div><span>Gross cost</span><strong>{buyPreview.grossCost == null ? '-' : `${money(buyPreview.grossCost)} ${buyPreview.grossCurrency}`}</strong></div>
              <div><span>Converted CAD cost</span><strong>{money(buyPreview.convertedCadCost)}</strong></div>
              <div><span>Fee CAD</span><strong>{money(buyPreview.feeCad)}</strong></div>
              <div><span>Total CAD cost</span><strong>{money(buyPreview.totalCadCost)}</strong></div>
              <div><span>Shares that will be added</span><strong>{buyPreview.sharesBought ?? '-'}</strong></div>
            </div>
            <p className="helpText">IBKR Preview remains final. Use cash amount mode when your IBKR order is a USD or CAD dollar amount instead of a share amount.</p>
            <label>
              Note optional
              <input value={buyForm.note} onChange={(event) => setBuyForm((current) => ({ ...current, note: event.target.value }))} />
            </label>
            <div className="formActions">
              <button type="submit" disabled={busy || Boolean(buyScanReview?.saveBlocked) || missingFillDetails.length > 0}>{buyScanReview?.saveBlocked ? 'Upload a Filled trade to continue' : missingFillDetails.length > 0 ? `Missing ${missingFillDetails.join(', ')}` : 'Save Buy'}</button>
              <button type="button" className="secondary" onClick={() => { setBuyModal(null); setBuyScreenshotPreview(''); }}>Cancel</button>
            </div>
            </div>
          </form>
        </div>
  );
}
