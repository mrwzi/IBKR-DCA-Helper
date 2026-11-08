import { DollarSign, MoreVertical, RefreshCw, ScanLine, Target } from 'lucide-react';

const tabs = [
  ['today', 'Today'],
  ['buyLog', 'Buy Log'],
  ['calendar', 'Calendar'],
  ['chart', 'Chart'],
  ['reports', 'Reports'],
  ['settings', 'Settings'],
];

export function AppChrome({
  activeTab,
  setActiveTab,
  openManualBuy,
  openAddMoney,
  openLimitOrder,
  canRecordBuy,
  refreshPrices,
  canRefresh,
  moreOpen,
  setMoreOpen,
  exportCsv,
  canExport,
  exportReportCsv,
  canExportBuyLog,
}) {
  return (
    <>
      <header className="topbar">
        <div>
          <h1>DCA Helper</h1>
          <p>Local manual portfolio planner</p>
        </div>
        <div className="actions">
          <button onClick={openManualBuy} disabled={!canRecordBuy}>
            <ScanLine size={16} /> Record Buy
          </button>
          <button className="secondary cashActivityAction" onClick={openAddMoney}>
            <DollarSign size={16} /> Add money
          </button>
          <button className="secondary limitOrderAction" onClick={openLimitOrder} disabled={!canRecordBuy} title={!canRecordBuy ? 'Add a holding before creating a limit order.' : ''}>
            <Target size={16} /> Limit order
          </button>
          <button onClick={() => refreshPrices({ manual: true })} disabled={!canRefresh} title={!canRefresh ? 'Enable at least one holding first.' : ''}>
            <RefreshCw size={16} /> Refresh Prices
          </button>
          <div className="menuWrap">
            <button type="button" className="secondary iconButton" onClick={() => setMoreOpen((current) => !current)} aria-label="More actions">
              <MoreVertical size={17} />
            </button>
            {moreOpen && (
              <div className="menu">
                <button type="button" onClick={() => { setMoreOpen(false); refreshPrices({ manual: true, refreshHistorical: true }); }} disabled={!canRefresh}>Refresh Historical Data</button>
                <button type="button" onClick={() => { setMoreOpen(false); exportCsv(); }} disabled={!canExport}>Export DCA CSV</button>
                <button type="button" onClick={() => { setMoreOpen(false); exportReportCsv(); }} disabled={!canExportBuyLog}>Export Buy Log CSV</button>
              </div>
            )}
          </div>
        </div>
      </header>
      <nav className="tabs">
        {tabs.map(([id, label]) => (
          <button key={id} className={activeTab === id ? 'active' : ''} onClick={() => setActiveTab(id)}>{label}</button>
        ))}
      </nav>
    </>
  );
}
