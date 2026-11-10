import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import activity from '../electron/ibkr-activity.cjs';
import storage from '../electron/storage.cjs';
const { parseActivityStatement, buildPreview, validateStatementMode, easternToUtc, reminderDue } = activity;
const { createDb } = storage;

describe('IBKR Activity Statement reconciliation', () => {
  it('parses the supplied YTD CSV and only completed stock buys', () => {
    const csv = [
      'Statement,Data,Period,"January 01, 2026 - August 21, 2026"',
      'Trades,Header,DataDiscriminator,Asset Category,Currency,Symbol,Date/Time,Quantity,T. Price,Comm/Fee,Proceeds,Basis',
      'Trades,Data,Order,Stocks,USD,DEMO,"2026-08-21, 09:30:00",0.5,100.00,-0.05,-50.00,50.05',
      'Trades,Data,Order,Stocks,USD,DEMO,"2026-08-21, 09:30:01",0.25,100.00,-0.03,-25.00,25.03',
      'Trades,Data,Subtotal,Stocks,USD,Total,,,,,,',
      'Open Positions,Header,Asset Category,Currency,Symbol,Quantity,Cost Price,Cost Basis',
      'Open Positions,Data,Stocks,USD,DEMO,0.75,100.00,75.00',
    ].join('\n');
    const parsed = parseActivityStatement(csv);
    expect(parsed.periodStart).toBe('2026-01-01');
    expect(parsed.periodEnd).toBe('2026-08-21');
    expect(parsed.trades).toHaveLength(2);
    expect(parsed.trades.map((trade) => trade.ticker)).toEqual(['DEMO', 'DEMO']);
    expect(parsed.positions.map((position) => position.shares)).toEqual([0.75]);
  });

  it('accepts a completed statement with positions but no buys', () => {
    const csv = [
      'Statement,Data,Period,"March 01, 2026 - March 31, 2026"',
      'Open Positions,Header,Asset Category,Currency,Symbol,Quantity,Close Price,Cost Price,Cost Basis',
      'Open Positions,Data,Stocks,USD,DEMO,0.75,105.00,100.00,75.00',
    ].join('\n');
    const parsed = parseActivityStatement(csv);
    expect(parsed.trades).toHaveLength(0);
    expect(parsed.positions).toHaveLength(1);
    const preview = buildPreview(parsed, [], 1.35);
    expect(preview.checks.find((check) => check.label === 'Completed stock executions parsed')).toMatchObject({ passed: true, blocking: false });
    const tempDir = fs.mkdtempSync('C:/Windows/Temp/dca-no-buy-statement-test-');
    let database;
    try {
      database = createDb(tempDir);
      database.saveHolding({ ticker: 'DEMO', priceSymbol: 'DEMO', currency: 'USD', sharesOwned: 0 });
      const result = database.applyIbkrReconciliation(preview, { fileName: 'quiet-month.csv', fileHash: 'quiet-month-hash' });
      expect(result.verification.executionsChecked).toBe(0);
      expect(database.listIbkrReconciliations()).toHaveLength(1);
      expect(database.listHoldings()[0]).toMatchObject({ ibkrPositionShares: 0.75, ibkrCostBasis: 75, ibkrAvgPrice: 100 });
    } finally {
      database?.close();
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('converts IBKR Eastern execution times across daylight saving time', () => {
    expect(easternToUtc('2026-07-28, 14:52:05')).toBe('2026-07-28T18:52:05.000Z');
    expect(easternToUtc('2026-01-15, 09:30:00')).toBe('2026-01-15T14:30:00.000Z');
  });

  it('leaves correct rows unchanged, corrects estimates, adds missing rows, and never deletes extras', () => {
    const statement = { periodStart: '2026-07-01', periodEnd: '2026-07-31', positions: [], trades: [
      { ticker: 'SMH', boughtAt: '2026-07-28T18:52:05.000Z', sharesBought: .0188, sharesText: '.0188', buyPrice: 529.58, buyPriceText: '529.58', grossUsd: 9.956104, commissionUsd: .099561096, allInUsd: 10.055665096, brokerTradeId: 'activity:a' },
      { ticker: 'QQQM', boughtAt: '2026-07-29T13:30:00.000Z', sharesBought: .02, sharesText: '.02', buyPrice: 280, buyPriceText: '280', grossUsd: 5.6, commissionUsd: .05, allInUsd: 5.65, brokerTradeId: 'activity:b' },
    ] };
    const local = [
      { id: 1, ticker: 'SMH', boughtAt: '2026-07-28T18:52:05.000Z', sharesBought: .0188, buyPrice: 530, grossUsd: null, commissionUsd: null },
      { id: 2, ticker: 'NVDA', boughtAt: '2026-07-10T13:30:00.000Z', sharesBought: .01, buyPrice: 200 },
    ];
    const preview = buildPreview(statement, local, 1.4);
    expect(preview.counts).toEqual({ review: 1, unchanged: 0, corrected: 1, added: 1 });
    expect(preview.review[0].localId).toBe(2);
    expect(preview.checks.find((check) => check.label === 'Local records needing review')).toMatchObject({ passed: false, blocking: false });
    expect(preview.checks.some((check) => !check.passed && check.blocking)).toBe(false);
  });

  it('matches a transmitted cash estimate to a later fill without duplicating it', () => {
    const statement = { periodStart: '2026-08-01', periodEnd: '2026-08-31', positions: [], trades: [
      { ticker: 'SMH', boughtAt: '2026-08-11T13:30:03.000Z', sharesBought: .0086, sharesText: '.0086', buyPrice: 577.05, buyPriceText: '577.05', grossUsd: 4.96263, commissionUsd: .049626, allInUsd: 5.012256, brokerTradeId: 'activity:fill' },
    ] };
    const local = [{ id: 9, ticker: 'SMH', boughtAt: '2026-08-10T23:43:41.363Z', sharesBought: 5 / 570, buyPrice: 570, grossUsd: null, commissionUsd: null, source: 'screenshot-estimated' }];
    const preview = buildPreview(statement, local, 1.4);
    expect(preview.counts).toEqual({ review: 0, unchanged: 0, corrected: 1, added: 0 });
    expect(preview.actions[0].localId).toBe(9);
  });

  it('does not treat old month-end positions as current when newer local trades exist', () => {
    const statement = { periodStart: '2026-07-01', periodEnd: '2026-07-31', positions: [{ ticker: 'SMH', shares: .1 }], trades: [
      { ticker: 'SMH', boughtAt: '2026-07-28T18:52:05.000Z', sharesBought: .0188, sharesText: '.0188', buyPrice: 529.58, buyPriceText: '529.58', grossUsd: 9.956104, commissionUsd: .099561096, allInUsd: 10.055665096, brokerTradeId: 'activity:july' },
    ] };
    const local = [
      { id: 1, ticker: 'SMH', boughtAt: '2026-07-28T18:52:05.000Z', sharesBought: .0188, buyPrice: 529.58, grossUsd: 9.956104, commissionUsd: .099561096, ibkrTradeId: 'activity:july' },
      { id: 2, ticker: 'SMH', boughtAt: '2026-08-10T13:30:00.000Z', sharesBought: .01, buyPrice: 570 },
    ];
    expect(buildPreview(statement, local, 1.4).statement.positionUpdateEligible).toBe(false);
  });

  it('does not prompt a new user and reminds after the first statement import', () => {
    const now = new Date('2026-08-24T12:00:00Z');
    expect(reminderDue([], {}, now)).toEqual({ due: false, month: '2026-07' });
    expect(reminderDue([{ periodStart: '2026-06-01', periodEnd: '2026-06-30' }], {}, now)).toEqual({ due: true, month: '2026-07' });
    expect(reminderDue([{ periodStart: '2026-01-01', periodEnd: '2026-08-21' }], {}, now).due).toBe(false);
  });

  it('requires the selected monthly or YTD period to match the CSV', () => {
    expect(validateStatementMode({ periodStart: '2026-01-01', periodEnd: '2026-08-21' }, 'ytd')).toBe('Year-to-date');
    expect(validateStatementMode({ periodStart: '2026-07-01', periodEnd: '2026-07-31' }, 'monthly')).toBe('Completed month');
    expect(() => validateStatementMode({ periodStart: '2026-01-01', periodEnd: '2026-08-21' }, 'monthly')).toThrow(/full calendar month/);
  });

  it('applies to an isolated database, records history, and creates a backup', () => {
    const tempDir = fs.mkdtempSync('C:/Windows/Temp/dca-ibkr-test-');
    let database;
    try {
      database = createDb(tempDir);
      const statement = { periodStart: '2026-01-01', periodEnd: '2026-08-21', positions: [{ ticker: 'DEMO', shares: 0.75, costBasis: 75, avgPrice: 100 }], trades: [
        { ticker: 'DEMO', boughtAt: '2026-08-21T13:30:00.000Z', sharesBought: 0.5, sharesText: '0.5', buyPrice: 100, buyPriceText: '100', grossUsd: 50, commissionUsd: 0.05, allInUsd: 50.05, brokerTradeId: 'activity:demo-1' },
        { ticker: 'DEMO', boughtAt: '2026-08-21T13:30:01.000Z', sharesBought: 0.25, sharesText: '0.25', buyPrice: 100, buyPriceText: '100', grossUsd: 25, commissionUsd: 0.03, allInUsd: 25.03, brokerTradeId: 'activity:demo-2' },
      ] };
      database.saveHolding({ ticker: 'DEMO', priceSymbol: 'DEMO', currency: 'USD', sharesOwned: 0 });
      const preview = buildPreview(statement, database.listBuyLog(), database.getSettings().usdCadRate);
      expect(preview.counts.review).toBe(0);
      const result = database.applyIbkrReconciliation(preview, { fileName: 'statement.csv', fileHash: 'integration-test-hash' });
      expect(database.listBuyLog()).toHaveLength(2);
      expect(result.history).toHaveLength(1);
      expect(result.verification).toEqual({ passed: true, executionsChecked: 2, duplicateIds: 0, holdingTotalsChecked: 1, cashChecked: false, cashAdjustmentCAD: 0 });
      expect(fs.existsSync(result.backupPath)).toBe(true);
      expect(() => database.applyIbkrReconciliation(preview, { fileName: 'statement.csv', fileHash: 'integration-test-hash' })).toThrow(/already been applied/);
      const demo = database.listHoldings().find((holding) => holding.ticker === 'DEMO');
      database.saveHolding({ ...demo, sharesOwned: 999 });
      const repair = database.repairHoldingShareTotals();
      expect(repair.repaired).toBe(1);
      expect(fs.existsSync(repair.backupPath)).toBe(true);
      expect(database.listHoldings().find((holding) => holding.ticker === 'DEMO').sharesOwned).toBeCloseTo(0.75, 10);
    } finally {
      database?.close();
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('keeps cash activity separate from shares and links new buys to one cash debit', () => {
    const tempDir = fs.mkdtempSync('C:/Windows/Temp/dca-cash-test-');
    let database;
    try {
      database = createDb(tempDir);
      database.saveCashTransaction({ type: 'deposit', amountCAD: 200, occurredAt: '2026-09-01T12:00:00.000Z' });
      database.saveCashTransaction({ type: 'fee', amountCAD: 5, occurredAt: '2026-09-02T12:00:00.000Z' });
      expect(database.getCashSummary().balanceCAD).toBe(195);
      const holding = database.saveHolding({ ticker: 'SMH', priceSymbol: 'SMH', currency: 'USD', sharesOwned: 0 });
      const saved = database.saveBuyLog({
        holdingId: holding.id, ticker: 'SMH', sharesBought: 0.1, buyPrice: 100,
        priceCurrency: 'USD', cadAmount: 14, feeCAD: 1, boughtAt: '2026-09-03T12:00:00.000Z',
      });
      expect(database.getCashSummary().balanceCAD).toBe(180);
      expect(saved).toHaveLength(1);
      expect(database.listHoldings().find((row) => row.id === holding.id).sharesOwned).toBeCloseTo(0.1, 10);
      database.deleteBuyLog(saved[0].id);
      expect(database.getCashSummary().balanceCAD).toBe(195);
      expect(database.listHoldings().find((row) => row.id === holding.id).sharesOwned).toBe(0);
    } finally {
      database?.close();
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('reconciles IBKR ending CAD cash without double-counting repeated statements', () => {
    const tempDir = fs.mkdtempSync('C:/Windows/Temp/dca-statement-cash-test-');
    let database;
    try {
      database = createDb(tempDir);
      database.saveCashTransaction({ type: 'deposit', amountCAD: 200, occurredAt: '2026-09-01T12:00:00.000Z' });
      database.saveHolding({ ticker: 'DEMO', priceSymbol: 'DEMO', currency: 'USD', sharesOwned: 0 });
      const statement = {
        periodStart: '2026-09-01', periodEnd: '2026-09-30', cash: 180,
        positions: [{ ticker: 'DEMO', shares: 0.1, costBasis: 10, avgPrice: 100 }],
        trades: [{ ticker: 'DEMO', boughtAt: '2026-09-15T13:30:00.000Z', sharesBought: 0.1, sharesText: '0.1', buyPrice: 100, buyPriceText: '100', grossUsd: 10, commissionUsd: 0.05, allInUsd: 10.05, brokerTradeId: 'activity:cash-1' }],
      };
      const apply = (hash) => {
        const preview = buildPreview(statement, database.listBuyLog(), database.getSettings().usdCadRate, database.getCashBalanceAt(`${statement.periodEnd}T23:59:59.999Z`));
        return database.applyIbkrReconciliation(preview, { fileName: `${hash}.csv`, fileHash: hash });
      };
      const first = apply('cash-statement-1');
      expect(first.verification.cashChecked).toBe(true);
      expect(first.verification.cashAdjustmentCAD).not.toBe(0);
      expect(database.getCashSummary().balanceCAD).toBeCloseTo(180, 8);
      expect(database.listCashTransactions().filter((row) => row.type === 'adjustment')).toHaveLength(1);

      // Newer activity must remain in today's available cash when an older
      // statement is imported again.
      database.saveCashTransaction({ type: 'deposit', amountCAD: 50, occurredAt: '2026-10-01T12:00:00.000Z' });
      const second = apply('cash-statement-1-copy');
      expect(second.verification.cashAdjustmentCAD).toBeCloseTo(0, 8);
      expect(database.getCashSummary().balanceCAD).toBeCloseTo(230, 8);
      expect(database.listCashTransactions().filter((row) => row.type === 'adjustment')).toHaveLength(1);
    } finally {
      database?.close();
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('stores limit orders without changing portfolio shares', () => {
    const tempDir = fs.mkdtempSync('C:/Windows/Temp/dca-limit-order-test-');
    let database;
    try {
      database = createDb(tempDir);
      const holding = database.saveHolding({ ticker: 'DEMO', priceSymbol: 'DEMO', currency: 'USD', sharesOwned: 2 });
      const before = database.listHoldings().find((row) => row.id === holding.id).sharesOwned;
      const saved = database.savePendingOrder({
        holdingId: holding.id,
        ticker: 'DEMO',
        mode: 'shares',
        sharesBought: 0.5,
        orderType: 'LIMIT',
        orderSide: 'BUY',
        limitPrice: 100,
        limitCurrency: 'USD',
        note: 'pullback target',
      });
      expect(saved[0]).toMatchObject({ orderType: 'LIMIT', orderSide: 'BUY', limitPrice: 100, limitCurrency: 'USD', note: 'pullback target' });
      expect(database.listHoldings().find((row) => row.id === holding.id).sharesOwned).toBe(before);
      expect(() => database.savePendingOrder({ holdingId: holding.id, ticker: 'DEMO', mode: 'shares', sharesBought: 0.5, orderType: 'LIMIT', limitPrice: 0 })).toThrow(/positive limit price/);
      const cashOrder = database.savePendingOrder({
        holdingId: holding.id, ticker: 'DEMO', mode: 'cash', cashPaidAmount: 110, cashPaidCurrency: 'USD',
        orderType: 'LIMIT', orderSide: 'BUY', limitPrice: 161.14, limitCurrency: 'USD',
        screenshotDataUrl: 'data:image/png;base64,ZmFrZS1vcmRlci1wcmV2aWV3',
      }).find((order) => order.limitPrice === 161.14);
      expect(cashOrder).toMatchObject({ mode: 'cash', cashPaidAmount: 110, cashPaidCurrency: 'USD', limitPrice: 161.14, status: 'PENDING', screenshotDataUrl: 'data:image/png;base64,ZmFrZS1vcmRlci1wcmV2aWV3' });
      const cancelled = database.cancelPendingOrder(cashOrder.id).find((order) => order.id === cashOrder.id);
      expect(cancelled).toMatchObject({ status: 'CANCELLED', cashPaidAmount: 110 });
      expect(cancelled.cancelledAt).toBeTruthy();
      expect(database.listHoldings().find((row) => row.id === holding.id).sharesOwned).toBe(before);
    } finally {
      database?.close();
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('keeps repeated monthly and YTD imports idempotent and applies corrections safely', () => {
    const tempDir = fs.mkdtempSync('C:/Windows/Temp/dca-repeated-statements-test-');
    let database;
    const trade = (id, date, shares, price, commission = 0.05) => ({
      ticker: 'DEMO', boughtAt: `${date}T13:30:00.000Z`, sharesBought: shares, sharesText: String(shares),
      buyPrice: price, buyPriceText: String(price), grossUsd: shares * price, commissionUsd: commission,
      allInUsd: shares * price + commission, brokerTradeId: `activity:${id}`,
    });
    const apply = (statement, hash) => {
      const preview = buildPreview(statement, database.listBuyLog(), database.getSettings().usdCadRate);
      expect(preview.checks.some((check) => !check.passed && check.blocking)).toBe(false);
      return database.applyIbkrReconciliation(preview, { fileName: `${hash}.csv`, fileHash: hash });
    };
    try {
      database = createDb(tempDir);
      database.saveHolding({ ticker: 'DEMO', priceSymbol: 'DEMO', currency: 'USD', sharesOwned: 0 });
      const janA = trade('jan-a', '2026-01-15', 0.1, 100);
      const janB = trade('jan-b', '2026-01-20', 0.2, 101, 0.06);
      const febC = trade('feb-c', '2026-02-10', 0.3, 102, 0.07);

      apply({ periodStart: '2026-01-01', periodEnd: '2026-01-31', positions: [{ ticker: 'DEMO', shares: 0.3, costBasis: 30.26, avgPrice: 100.8666667 }], trades: [janA, janB] }, 'statement-jan');
      expect(database.listBuyLog()).toHaveLength(2);

      // The same completed month imported again is unchanged, not duplicated.
      const repeatedJan = apply({ periodStart: '2026-01-01', periodEnd: '2026-01-31', positions: [{ ticker: 'DEMO', shares: 0.3, costBasis: 30.26, avgPrice: 100.8666667 }], trades: [janA, janB] }, 'statement-jan-copy');
      expect(repeatedJan.verification.executionsChecked).toBe(2);
      expect(database.listBuyLog()).toHaveLength(2);

      apply({ periodStart: '2026-02-01', periodEnd: '2026-02-28', positions: [{ ticker: 'DEMO', shares: 0.6, costBasis: 60.93, avgPrice: 101.55 }], trades: [febC] }, 'statement-feb');
      expect(database.listBuyLog()).toHaveLength(3);

      // A later YTD statement sees all three broker executions as unchanged.
      const ytd = apply({ periodStart: '2026-01-01', periodEnd: '2026-02-28', positions: [{ ticker: 'DEMO', shares: 0.6, costBasis: 60.93, avgPrice: 101.55 }], trades: [janA, janB, febC] }, 'statement-ytd');
      expect(ytd.verification.executionsChecked).toBe(3);
      expect(database.listBuyLog()).toHaveLength(3);

      // A corrected commission/price from a later statement updates the existing row.
      const correctedFebC = trade('feb-c-corrected', '2026-02-10', 0.3, 102.25, 0.08);
      const corrected = apply({ periodStart: '2026-02-01', periodEnd: '2026-02-28', positions: [{ ticker: 'DEMO', shares: 0.6, costBasis: 61.005, avgPrice: 101.675 }], trades: [correctedFebC] }, 'statement-feb-correction');
      expect(corrected.verification.executionsChecked).toBe(1);
      expect(database.listBuyLog()).toHaveLength(3);
      const savedCorrection = database.listBuyLog().find((row) => row.boughtAt === febC.boughtAt);
      expect(savedCorrection).toMatchObject({ buyPrice: 102.25, commissionUsd: 0.08, ibkrTradeId: 'activity:feb-c-corrected' });
      expect(database.listCashTransactions().filter((row) => row.buyLogId === savedCorrection.id)).toHaveLength(1);
      expect(database.listIbkrReconciliations()).toHaveLength(5);
      expect(database.listIbkrReconciliations().every((item) => fs.existsSync(item.backupPath))).toBe(true);
      expect(database.listBuyLog().map((row) => row.ibkrTradeId)).toEqual(expect.arrayContaining(['activity:jan-a', 'activity:jan-b', 'activity:feb-c-corrected']));
    } finally {
      database?.close();
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
