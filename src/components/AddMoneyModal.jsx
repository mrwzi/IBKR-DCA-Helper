import { useState } from 'react';

export function AddMoneyModal({ cashSummary, money, onSave, onDelete, busy, onClose }) {
  const [form, setForm] = useState({ amountCAD: '', occurredAt: '', note: '' });
  const recentDeposits = (cashSummary?.transactions || []).filter((transaction) => transaction.type === 'deposit' && !transaction.buyLogId).slice(0, 3);
  const update = (changes) => setForm((current) => ({ ...current, ...changes }));
  const save = async (event) => {
    event.preventDefault();
    const saved = await onSave({ type: 'deposit', ...form });
    if (saved) setForm({ amountCAD: '', occurredAt: '', note: '' });
  };

  return <div className="modalBackdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="modal addMoneyModal" role="dialog" aria-modal="true" aria-labelledby="add-money-title" onMouseDown={(event) => event.stopPropagation()}>
      <header className="addMoneyModalHeader">
        <div>
          <h2 id="add-money-title">Add money</h2>
          <p>Add money to your available CAD balance. This does not change shares, trade prices, or holdings.</p>
        </div>
        <div className="addMoneyHeaderActions">
          <div className="cashBalance"><small>Available cash</small><strong>{money(cashSummary?.balanceCAD || 0)}</strong></div>
          <button type="button" className="secondary iconButton" onClick={onClose} aria-label="Close add money">×</button>
        </div>
      </header>
      <form className="addMoneyForm" onSubmit={save}>
        <label>Amount CAD<input required type="number" min="0.01" step="0.01" value={form.amountCAD} onChange={(event) => update({ amountCAD: event.target.value })} placeholder="0.00" autoFocus /></label>
        <label>Date/time <small>Leave blank to use now</small><input type="datetime-local" value={form.occurredAt} onChange={(event) => update({ occurredAt: event.target.value })} /></label>
        <label>Note <small>Optional</small><input value={form.note} onChange={(event) => update({ note: event.target.value })} placeholder="e.g. November contribution" /></label>
        <div className="addMoneyActions"><button className="addMoneySubmit" disabled={busy}>{busy ? 'Saving…' : 'Add money'}</button><button type="button" className="secondary" onClick={onClose}>Cancel</button></div>
      </form>
      {recentDeposits.length > 0 && <section className="addMoneyRecent" aria-label="Recent deposits">
        <div className="addMoneyRecentHeading"><strong>Recent deposits</strong><small>Remove one if it was entered by mistake.</small></div>
        {recentDeposits.map((transaction) => <div className="addMoneyRecentRow" key={transaction.id}><span><strong>{money(transaction.amountCAD)}</strong><small>{new Date(transaction.occurredAt).toLocaleString()}</small>{transaction.note && <small>{transaction.note}</small>}</span><button type="button" className="secondary danger" disabled={busy} onClick={() => onDelete(transaction.id)}>Remove</button></div>)}
      </section>}
    </section>
  </div>;
}
