import { useState } from 'react';

export function SettingsPage(props) {
  const {
    busy, checkIbkrConnection, checkYahooConnection,
    checkingConnection, chooseIbkrActivityStatement, connectionStatus,
    formatDate, ibkrActivityStatus, ibkrImportStage, money,
    saveSettings, settings, settingsWarning, updateUsdCadRate,
  } = props;
  const [advancedOpen, setAdvancedOpen] = useState(false);
  if (!settings) return null;
  const update = (changes) => saveSettings({ ...settings, ...changes });

  return <main className="layout settingsLayout"><section className="panel settingsPanel">
    <header className="settingsHeader"><div><h2>Settings</h2><p>Manage market data and IBKR statement checks.</p></div><span className="localDataBadge">Saved locally</span></header>

    <div className="settingsCard marketDataCard">
      <div className="sectionHead"><div><h3>Market data</h3><p>Choose how prices and currency conversions refresh.</p></div></div>
      <div className="settingsGrid">
        <label className="toggle compactToggle settingToggle"><input type="checkbox" checked={Boolean(settings.autoRefreshEnabled)} onChange={(event) => update({ autoRefreshEnabled: event.target.checked })} /><span><strong>Auto refresh</strong><small>Keep market prices current</small></span></label>
        <label>Refresh interval<input type="number" step="1" min="60" value={settings.autoRefreshIntervalSeconds} onChange={(event) => update({ autoRefreshIntervalSeconds: Number(event.target.value) })} /><small>Seconds</small></label>
        <label>USD/CAD rate<input type="number" step="0.0001" value={settings.usdCadRate} onChange={(event) => updateUsdCadRate(event.target.value)} /></label>
        <label>Price source<select value={settings.priceSource || 'Yahoo'} onChange={(event) => update({ priceSource: event.target.value })}><option>Auto</option><option>IBKR Relay</option><option>Yahoo</option></select></label>
      </div>
      <div className="settingsStatusRow"><div className="metaLine"><span>FX source: <strong>{settings.usdCadRateSource === 'fetched' ? 'Fetched' : 'Manual'}</strong></span><span>Updated: <strong>{formatDate(settings.usdCadRateUpdatedAt)}</strong></span></div><div className="connectionChecks"><button className="secondary" onClick={checkYahooConnection} disabled={checkingConnection === 'yahoo'}>{checkingConnection === 'yahoo' ? 'Checking Yahoo…' : 'Test Yahoo'}</button>{connectionStatus && <span className="connectionStatus">{connectionStatus}</span>}</div></div>
      {settings.usdCadRateWarning && <p className="warning">FX fetch failed. Manual USD/CAD override is active. {settings.usdCadRateWarning}</p>}
      {settingsWarning && <p className="warning">{settingsWarning}</p>}
    </div>

    <div className="settingsCard reconciliationSection">
      <div className="sectionHead"><div><h3>IBKR statement reconciliation</h3><p>Import a statement to verify trades. You review every proposed change before a local backup is created and anything is applied.</p></div></div>
      <div className="statementChoices"><article><span className="choiceTag">Repair</span><h4>Year-to-date</h4><p>Use January 1 through today to find and correct anything missed this year.</p><button onClick={() => chooseIbkrActivityStatement('ytd')}>Import year-to-date CSV</button></article><article><span className="choiceTag">Routine check</span><h4>Completed month</h4><p>Use the full previous calendar month for your regular accuracy check.</p><button onClick={() => chooseIbkrActivityStatement('monthly')}>Import monthly CSV</button></article></div>
      {ibkrImportStage && <p className="importStage" role="status"><span className="stageSpinner" />{ibkrImportStage}</p>}
      {(ibkrActivityStatus?.history || []).length > 0 ? <div className="reconciliationHistory"><h4>Recent imports</h4>{ibkrActivityStatus.history.slice(0, 5).map((item) => <div key={item.id}><strong>{item.periodStart} — {item.periodEnd}</strong><span>Activity Statement</span><span>{formatDate(item.importedAt)}</span></div>)}</div> : <p className="emptySettingsState">No statements imported yet.</p>}
    </div>

    <div className="settingsFooterGrid">
      <div className="settingsCard advancedConnection"><div><h3>Advanced connection</h3><p>Only needed when you run the optional IBKR Relay.</p></div><button className="secondary" onClick={() => setAdvancedOpen((open) => !open)}>{advancedOpen ? 'Hide relay settings' : 'Configure IBKR Relay'}</button>{advancedOpen && <div className="advancedSettings"><label>IBKR Relay URL<input value={settings.ibkrRelayUrl || ''} onChange={(event) => update({ ibkrRelayUrl: event.target.value })} placeholder="http://server:8787" /></label><div className="connectionChecks"><button className="secondary" onClick={checkIbkrConnection} disabled={checkingConnection === 'ibkr'}>{checkingConnection === 'ibkr' ? 'Checking IBKR…' : 'Test IBKR Relay'}</button></div></div>}</div>
      <div className="settingsCard privacySection"><div><h3>Privacy</h3><p>Portfolio data and backups stay on this computer. Imported statement filenames are hidden in the app.</p></div><span className="privacyMark">Local only</span></div>
    </div>
  </section></main>;
}
