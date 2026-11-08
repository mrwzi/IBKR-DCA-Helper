import { useState } from 'react';

export function LimitOrderModal({ holdings, busy, onSave, onClose }) {
  const [form, setForm] = useState(() => ({
    holdingId: holdings[0]?.id || '',
    orderSide: 'BUY',
    sharesBought: '',
    limitPrice: '',
    limitCurrency: holdings[0]?.currency || 'USD',
    note: '',
  }));
  const holding = holdings.find((item) => String(item.id) === String(form.holdingId));
  const update = (changes) => setForm((current) => ({ ...current, ...changes }));
  const chooseHolding = (event) => {
    const next = holdings.find((item) => String(item.id) === event.target.value);
    update({ holdingId: event.target.value, limitCurrency: next?.currency || 'USD' });
  };
  const save = async (event) => {
    event.preventDefault();
    await onSave({ ...form, ticker: holding?.ticker || '', mode: 'shares' });
  };

  return <div className="modalBackdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="modal limitOrderModal" role="dialog" aria-modal="true" aria-labelledby="limit-order-title" onMouseDown={(event) => event.stopPropagation()}>
      <header className="limitOrderHeader">
        <div><h2 id="limit-order-title">Reserve limit order</h2><p>Save a buy or sell target to watch. DCA Helper never submits orders to IBKR automatically.</p></div>
        <button type="button" className="secondary iconButton" onClick={onClose} aria-label="Close limit order">×</button>
      </header>
      {holdings.length === 0 ? <div className="emptySettingsState">Add a holding before creating a limit order.</div> : <form className="limitOrderForm" onSubmit={save}>
        <label>Symbol<select value={form.holdingId} onChange={chooseHolding}>{holdings.map((item) => <option key={item.id} value={item.id}>{item.ticker} — {item.name || item.ticker}</option>)}</select></label>
        <div className="two"><label>Side<select value={form.orderSide} onChange={(event) => update({ orderSide: event.target.value })}><option value="BUY">Buy</option><option value="SELL">Sell</option></select></label><label>Quantity (shares)<input required type="number" min="0.000001" step="0.000001" value={form.sharesBought} onChange={(event) => update({ sharesBought: event.target.value })} placeholder="0.000000" /></label></div>
        <div className="two"><label>Limit price<input required type="number" min="0.000001" step="0.0001" value={form.limitPrice} onChange={(event) => update({ limitPrice: event.target.value })} placeholder="0.00" /></label><label>Price currency<input value={holding?.currency || form.limitCurrency || 'USD'} readOnly aria-label="Price currency" /></label></div>
        <label>Note <small>Optional</small><input value={form.note} onChange={(event) => update({ note: event.target.value })} placeholder="e.g. add on pullback" /></label>
        <div className="limitOrderNotice">Buy limit: ready when the market price is at or below your limit. Sell limit: ready when it is at or above your limit. You still complete and verify the order in IBKR.</div>
        <div className="addMoneyActions"><button disabled={busy}>{busy ? 'Saving…' : 'Save limit order'}</button><button type="button" className="secondary" onClick={onClose}>Cancel</button></div>
      </form>}
    </section>
  </div>;
}
