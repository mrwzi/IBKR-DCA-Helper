import { useRef, useState } from 'react';
import { ScanLine } from 'lucide-react';
import { recognizeImageText } from '../lib/ocr.js';
import { parseBrokerageBuyScreenshot } from '../lib/ocrParse.js';

export function LimitOrderModal({ holdings, busy, onSave, onClose }) {
  const [form, setForm] = useState(() => ({
    holdingId: holdings[0]?.id || '',
    orderSide: 'BUY',
    mode: 'shares',
    sharesBought: '',
    cashPaidAmount: '',
    cashPaidCurrency: holdings[0]?.currency || 'USD',
    limitPrice: '',
    limitCurrency: holdings[0]?.currency || 'USD',
    estimatedFeeAmount: '',
    feeCurrency: holdings[0]?.currency || 'USD',
    note: '',
    screenshotDataUrl: '',
  }));
  const [screenshotStatus, setScreenshotStatus] = useState('');
  const screenshotInputRef = useRef(null);
  const holding = holdings.find((item) => String(item.id) === String(form.holdingId));
  const update = (changes) => setForm((current) => ({ ...current, ...changes }));
  const chooseHolding = (event) => {
    const next = holdings.find((item) => String(item.id) === event.target.value);
    update({ holdingId: event.target.value, limitCurrency: next?.currency || 'USD', cashPaidCurrency: next?.currency || 'USD', feeCurrency: next?.currency || 'USD' });
  };
  const save = async (event) => {
    event.preventDefault();
    await onSave({ ...form, ticker: holding?.ticker || '' });
  };
  const analyzeScreenshot = async (file) => {
    setScreenshotStatus('Reading screenshot details…');
    try {
      const text = await recognizeImageText(file);
      const knownTickers = holdings.map((item) => item.ticker).filter(Boolean);
      const currentHolding = holdings.find((item) => String(item.id) === String(form.holdingId));
      const parsed = parseBrokerageBuyScreenshot(text, knownTickers, currentHolding?.currency || 'USD');
      const matchedHolding = holdings.find((item) => item.ticker?.toUpperCase() === parsed.ticker?.toUpperCase());
      const nextHolding = matchedHolding || currentHolding;
      update({
        holdingId: nextHolding?.id || form.holdingId,
        orderSide: parsed.action === 'SELL' ? 'SELL' : parsed.action === 'BUY' ? 'BUY' : form.orderSide,
        mode: parsed.mode === 'cash' ? 'cash' : parsed.sharesBought != null ? 'shares' : form.mode,
        sharesBought: parsed.sharesBought ?? form.sharesBought,
        cashPaidAmount: parsed.cashPaidAmount ?? form.cashPaidAmount,
        cashPaidCurrency: parsed.cashPaidCurrency || form.cashPaidCurrency,
        limitPrice: parsed.limitPrice ?? form.limitPrice,
        limitCurrency: parsed.priceCurrency || form.limitCurrency,
        estimatedFeeAmount: parsed.feeAmount ?? form.estimatedFeeAmount,
        feeCurrency: parsed.feeCurrency || form.feeCurrency,
      });
      const detected = [
        parsed.ticker,
        parsed.mode === 'cash' && parsed.cashPaidAmount != null ? `${parsed.cashPaidAmount} ${parsed.cashPaidCurrency || ''}`.trim() : parsed.sharesBought != null ? `${parsed.sharesBought} shares` : null,
        parsed.limitPrice != null ? `limit ${parsed.limitPrice} ${parsed.priceCurrency || ''}`.trim() : null,
        parsed.feeAmount != null ? `estimated fee ${parsed.feeAmount} ${parsed.feeCurrency || ''}`.trim() : null,
      ].filter(Boolean);
      setScreenshotStatus(detected.length ? `Detected ${detected.join(' · ')}. Review before saving.` : 'Screenshot attached, but no order values were detected. Enter them manually.');
    } catch (error) {
      setScreenshotStatus(`Screenshot attached, but analysis failed: ${error.message || 'unknown error'}`);
    }
  };
  const readScreenshot = (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setScreenshotStatus('Please paste or choose an image screenshot.');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setScreenshotStatus('Please choose an image smaller than 8 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      update({ screenshotDataUrl: String(reader.result || '') });
      await analyzeScreenshot(file);
    };
    reader.onerror = () => setScreenshotStatus('Could not read that screenshot.');
    reader.readAsDataURL(file);
  };
  const chooseScreenshot = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    readScreenshot(file);
  };
  const handlePaste = (event) => {
    const imageFile = [...(event.clipboardData?.files || [])].find((file) => file.type.startsWith('image/'))
      || [...(event.clipboardData?.items || [])].map((item) => item.getAsFile?.()).find((file) => file?.type?.startsWith('image/'));
    if (!imageFile) return;
    event.preventDefault();
    readScreenshot(imageFile);
  };

  return <div className="modalBackdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="modal limitOrderModal" role="dialog" aria-modal="true" aria-labelledby="limit-order-title" onMouseDown={(event) => event.stopPropagation()} onPaste={handlePaste}>
      <header className="limitOrderHeader">
        <div><h2 id="limit-order-title">Reserve limit order</h2><p>Save a buy or sell target to watch. DCA Helper never submits orders to IBKR automatically.</p></div>
        <button type="button" className="secondary iconButton" onClick={onClose} aria-label="Close limit order">×</button>
      </header>
      {holdings.length === 0 ? <div className="emptySettingsState">Add a holding before creating a limit order.</div> : <form className="limitOrderForm" onSubmit={save}>
        <label>Symbol<select value={form.holdingId} onChange={chooseHolding}>{holdings.map((item) => <option key={item.id} value={item.id}>{item.ticker} — {item.name || item.ticker}</option>)}</select></label>
        <label>Side<select value={form.orderSide} onChange={(event) => update({ orderSide: event.target.value })}><option value="BUY">Buy</option><option value="SELL">Sell</option></select></label>
        <div className="orderModeSwitch" role="tablist" aria-label="Order amount mode">
          <button type="button" className={form.mode === 'shares' ? '' : 'secondary'} onClick={() => update({ mode: 'shares' })}>Quantity (shares)</button>
          <button type="button" className={form.mode === 'cash' ? '' : 'secondary'} onClick={() => update({ mode: 'cash' })}>Cash amount</button>
        </div>
        {form.mode === 'shares' ? (
          <label>Quantity (shares)<input required type="number" min="0" step="any" inputMode="decimal" value={form.sharesBought} onChange={(event) => update({ sharesBought: event.target.value })} placeholder="e.g. 0.09" /></label>
        ) : (
          <div className="two"><label>Cash amount<input required type="number" min="0" step="any" inputMode="decimal" value={form.cashPaidAmount} onChange={(event) => update({ cashPaidAmount: event.target.value })} placeholder="e.g. 110" /></label><label>Cash currency<select value={form.cashPaidCurrency} onChange={(event) => update({ cashPaidCurrency: event.target.value })}><option value="USD">USD</option><option value="CAD">CAD</option></select></label></div>
        )}
        <div className="two"><label>Limit price<input required type="number" min="0" step="any" inputMode="decimal" value={form.limitPrice} onChange={(event) => update({ limitPrice: event.target.value })} placeholder="e.g. 161.14" /></label><label>Price currency<input value={holding?.currency || form.limitCurrency || 'USD'} readOnly aria-label="Price currency" /></label></div>
        <div className="two"><label>Estimated fee <small>Optional</small><input type="number" min="0" step="any" inputMode="decimal" value={form.estimatedFeeAmount} onChange={(event) => update({ estimatedFeeAmount: event.target.value })} placeholder="e.g. 0.10" /></label><label>Fee currency<select value={form.feeCurrency} onChange={(event) => update({ feeCurrency: event.target.value })}><option value="USD">USD</option><option value="CAD">CAD</option></select></label></div>
        <label>Note <small>Optional</small><input value={form.note} onChange={(event) => update({ note: event.target.value })} placeholder="e.g. add on pullback" /></label>
        <div className="scanRow limitOrderScreenshotField">
          <strong>IBKR order screenshot</strong>
          <span className="helpText">Optional — preview only, never records a buy</span>
          <input ref={screenshotInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={chooseScreenshot} />
          <button type="button" className="secondary" onClick={() => screenshotInputRef.current?.click()}><ScanLine size={16} /> Upload brokerage screenshot</button>
          <div className="entryOptions">
            <span>Paste screenshot: Ctrl+V while this window is open</span>
            <span>Upload screenshot: choose an image file</span>
            <span>Import IBKR file: use the existing corrected IBKR import/reconciliation path</span>
            <button type="button" className="entryOptionButton" onClick={() => setScreenshotStatus('Manual entry enabled. Enter or edit the fields directly.')}>Manual entry: click here to edit the fields directly</button>
          </div>
          <span className="helpText">Analysis may take a bit longer because the app validates the fields before showing them.</span>
          {screenshotStatus && <span className="helpText">{screenshotStatus}</span>}
          {form.screenshotDataUrl && <img className="pendingOrderScreenshot limitOrderScreenshotPreview" src={form.screenshotDataUrl} alt="Limit order preview screenshot" />}
        </div>
        <div className="limitOrderNotice">Buy limit: ready when the market price is at or below your limit. Sell limit: ready when it is at or above your limit. You still complete and verify the order in IBKR.</div>
        <div className="addMoneyActions"><button disabled={busy}>{busy ? 'Saving…' : 'Save limit order'}</button><button type="button" className="secondary" onClick={onClose}>Cancel</button></div>
      </form>}
    </section>
  </div>;
}
