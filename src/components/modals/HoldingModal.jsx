import { Plus, ScanLine } from 'lucide-react';

export function HoldingModal(props) {
  const { advancedOpen, busy, emptyForm, form, formError, formIsValid, formTouched, handleHoldingScreenshot, holdingScanInputRef, holdingScanStatus, lookup, lookupStatus, money, percent, saveHolding, setAdvancedOpen, setForm, setFormTouched, setHoldingModalOpen, setLookup, updateForm } = props;
  return (
<div className="modalBackdrop">
          <section className="modal formPanel">
            <h2>{form.id ? 'Edit holding' : 'Add stock or ETF'}</h2>
            <form onSubmit={saveHolding} noValidate>
              <label>
                Symbol
                <input value={form.ticker} onChange={(event) => updateForm('ticker', event.target.value)} placeholder="Example: VFV.TO or NVDA" />
              </label>
              <label>
                Current shares
                <input type="number" step="0.000001" value={form.sharesOwned} onChange={(event) => updateForm('sharesOwned', event.target.value)} />
              </label>

              {(lookup || lookupStatus) && (
                <div className="lookupBox">
                  {lookup ? (
                    <>
                      <strong>{lookup.displayName}</strong>
                      <span>{lookup.priceSymbol} | {lookup.currency} | Last {money(lookup.lastPrice)} | Prev {money(lookup.previousClose)} | Change {percent(lookup.changePercent)}</span>
                    </>
                  ) : (
                    <span>{lookupStatus}</span>
                  )}
                </div>
              )}

              <button type="button" className="linkButton" onClick={() => setAdvancedOpen((open) => !open)}>
                {advancedOpen ? 'Hide Advanced' : 'Advanced'}
              </button>

              {advancedOpen && (
                <div className="advancedFields">
                  <label>
                    Display name
                    <input value={form.name} onChange={(event) => updateForm('name', event.target.value)} />
                  </label>
                  <label>
                    Price symbol
                    <input value={form.priceSymbol} onChange={(event) => updateForm('priceSymbol', event.target.value)} />
                  </label>
                  <div className="two">
                    <label>
                      Currency
                      <select value={form.currency} onChange={(event) => updateForm('currency', event.target.value)}>
                        <option>CAD</option>
                        <option>USD</option>
                      </select>
                    </label>
                    <label>
                      Manual price override
                      <input type="number" step="0.0001" value={form.manualPriceOverride ?? ''} onChange={(event) => updateForm('manualPriceOverride', event.target.value)} />
                    </label>
                    <label>
                      Manual previous close
                      <input type="number" step="0.0001" value={form.manualPreviousCloseOverride ?? ''} onChange={(event) => updateForm('manualPreviousCloseOverride', event.target.value)} />
                    </label>
                  </div>
                  <span className="helpText">Manual override uses the ticker currency. USD stock = USD price. CAD stock = CAD price.</span>
                  <div className="advancedDivider">IBKR contract override</div>
                  <div className="two">
                    <label>
                      IBKR symbol
                      <input value={form.ibkrSymbol || ''} onChange={(event) => updateForm('ibkrSymbol', event.target.value)} placeholder={form.ticker || 'SMH'} />
                    </label>
                    <label>
                      Sec type
                      <input value={form.ibkrSecType || 'STK'} onChange={(event) => updateForm('ibkrSecType', event.target.value)} />
                    </label>
                    <label>
                      Exchange
                      <input value={form.ibkrExchange || 'SMART'} onChange={(event) => updateForm('ibkrExchange', event.target.value)} />
                    </label>
                    <label>
                      IBKR currency
                      <select value={form.ibkrCurrency || form.currency} onChange={(event) => updateForm('ibkrCurrency', event.target.value)}>
                        <option>CAD</option>
                        <option>USD</option>
                      </select>
                    </label>
                    <label>
                      Primary exchange optional
                      <input value={form.ibkrPrimaryExchange || ''} onChange={(event) => updateForm('ibkrPrimaryExchange', event.target.value)} placeholder="NASDAQ, ARCA, TSX" />
                    </label>
                  </div>
                  <span className="helpText">US stocks default to STK / SMART / USD. Use these fields only when IBKR needs a different contract than the display or Yahoo symbol.</span>
                  <div className="advancedDivider">IBKR position reconciliation optional</div>
                  <div className="scanRow">
                    <input
                      ref={holdingScanInputRef}
                      type="file"
                      accept="image/*"
                      style={{ display: 'none' }}
                      onChange={handleHoldingScreenshot}
                    />
                    <button type="button" className="secondary" onClick={() => holdingScanInputRef.current?.click()}>
                      <ScanLine size={16} /> Scan IBKR Positions row screenshot
                    </button>
                    {holdingScanStatus && <span className="helpText">{holdingScanStatus}</span>}
                  </div>
                  <div className="two">
                    <label>
                      IBKR position shares
                      <input type="number" step="0.000001" value={form.ibkrPositionShares ?? ''} onChange={(event) => updateForm('ibkrPositionShares', event.target.value)} placeholder="Example: 0.0164" />
                    </label>
                    <label>
                      IBKR avg price
                      <input type="number" step="0.0001" value={form.ibkrAvgPrice ?? ''} onChange={(event) => updateForm('ibkrAvgPrice', event.target.value)} placeholder="Example: 610.88" />
                    </label>
                    <label>
                      IBKR cost basis
                      <input type="number" step="0.01" value={form.ibkrCostBasis ?? ''} onChange={(event) => updateForm('ibkrCostBasis', event.target.value)} placeholder="Example: 10" />
                    </label>
                  </div>
                  <button
                    type="button"
                    className="secondary"
                    disabled={form.ibkrPositionShares === '' || form.ibkrPositionShares == null}
                    onClick={() => updateForm('sharesOwned', form.ibkrPositionShares)}
                  >
                    Use IBKR position as current shares
                  </button>
                  <span className="helpText">Use the numbers from IBKR Positions. These fields do not affect BUY signals; they only make Reports match and show differences clearly.</span>
                  <label className="toggle">
                    <input type="checkbox" checked={form.enabled} onChange={(event) => updateForm('enabled', event.target.checked)} />
                    Enabled
                  </label>
                </div>
              )}

              {formTouched && formError && <div className="inlineError">{formError}</div>}
              <div className="formActions">
                <button type="submit" disabled={busy || !formIsValid}>
                  <Plus size={16} /> {form.id ? 'Save' : 'Add'}
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    setForm(emptyForm);
                    setLookup(null);
                    setAdvancedOpen(false);
                    setFormTouched(false);
                    setHoldingModalOpen(false);
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </section>
        </div>
  );
}
