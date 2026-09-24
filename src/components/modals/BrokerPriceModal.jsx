export function BrokerPriceModal(props) {
  const { brokerForm, brokerModal, busy, saveBrokerOverride, setBrokerForm, setBrokerModal } = props;
  return (
<div className="modalBackdrop">
          <form className="modal" onSubmit={saveBrokerOverride}>
            <h2>Use broker price</h2>
            <p className="helpText">IBKR Preview is final. Enter last price plus previous close, change $, or change % for {brokerModal.ticker}.</p>
            <label>
              Manual last price
              <input
                type="number"
                step="0.0001"
                value={brokerForm.manualPriceOverride}
                onChange={(event) => setBrokerForm((current) => ({ ...current, manualPriceOverride: event.target.value }))}
              />
            </label>
            <label>
              Manual previous close optional
              <input
                type="number"
                step="0.0001"
                value={brokerForm.manualPreviousCloseOverride}
                onChange={(event) => setBrokerForm((current) => ({ ...current, manualPreviousCloseOverride: event.target.value }))}
              />
            </label>
            <div className="two">
              <label>
                Change $ optional
                <input
                  type="number"
                  step="0.0001"
                  value={brokerForm.changeDollar}
                  onChange={(event) => setBrokerForm((current) => ({ ...current, changeDollar: event.target.value }))}
                />
              </label>
              <label>
                Change % optional
                <input
                  type="number"
                  step="0.0001"
                  value={brokerForm.changePercent}
                  onChange={(event) => setBrokerForm((current) => ({ ...current, changePercent: event.target.value }))}
                />
              </label>
            </div>
            <p className="helpText">Example: last 621.42 and change $ -15.46 calculates previous close 636.88.</p>
            <div className="formActions">
              <button type="submit" disabled={busy}>Save Override</button>
              <button type="button" className="secondary" onClick={() => setBrokerModal(null)}>Cancel</button>
            </div>
          </form>
        </div>
  );
}
