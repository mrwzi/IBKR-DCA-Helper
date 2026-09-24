import { useState } from 'react';

const labels = {
  'opening-balance': 'Opening balance', deposit: 'Deposit', withdrawal: 'Withdrawal', dividend: 'Dividend',
  interest: 'Interest', fee: 'Fee', adjustment: 'Adjustment', buy: 'Buy',
};

export function CashActivityPanel({ cashSummary, formatDate, money, onSave, onDelete, busy }) {
  const [form, setForm] = useState({ type: 'deposit', amountCAD: '', occurredAt: '', note: '' });
  const save = async (event) => {
    event.preventDefault();
    await onSave(form);
    setForm({ type: 'deposit', amountCAD: '', occurredAt: '', note: '' });
  };
  return <section className="settingsCard cashActivitySection">
    <div className="sectionHead"><div><h3>Cash activity</h3><p>Record money entering or leaving the account. This never changes shares or trade prices.</p></div><div className="cashBalance"><small>Available cash</small><strong>{money(cashSummary?.balanceCAD || 0)}</strong></div></div>
    <form className="cashActivityForm" onSubmit={save}>
      <label>Type<select value={form.type} onChange={(event) => setForm((current) => ({ ...current, type: event.target.value }))}>{['deposit', 'withdrawal', 'dividend', 'interest', 'fee', 'adjustment'].map((type) => <option key={type} value={type}>{labels[type]}</option>)}</select></label>
      <label>Amount CAD<input required type="number" step="0.01" value={form.amountCAD} onChange={(event) => setForm((current) => ({ ...current, amountCAD: event.target.value }))} placeholder="0.00" /></label>
      <label>Date/time<input type="datetime-local" value={form.occurredAt} onChange={(event) => setForm((current) => ({ ...current, occurredAt: event.target.value }))} /></label>
      <label className="cashNote">Note <small>Optional</small><input value={form.note} onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))} placeholder="e.g. September contribution" /></label>
      <button className="cashSubmit" disabled={busy}>Add cash activity</button>
    </form>
    {(cashSummary?.transactions || []).length > 0 && <div className="cashActivityList"><div className="cashListHeading"><span>Recent activity</span><span>Amount</span></div>{cashSummary.transactions.slice(0, 10).map((item) => <div className="cashActivityRow" key={item.id}><span className="cashActivityInfo"><strong>{labels[item.type] || item.type}</strong><small>{formatDate(item.occurredAt)}{item.note ? ` · ${item.note}` : ''}</small></span><b className={item.amountCAD < 0 ? 'lossText' : 'gainText'}>{item.amountCAD < 0 ? '−' : '+'}{money(Math.abs(item.amountCAD))}</b>{!['opening-balance', 'buy'].includes(item.type) && <button className="secondary cashDelete" type="button" onClick={() => onDelete(item.id)} disabled={busy}>Delete</button>}</div>)}</div>}
  </section>;
}
