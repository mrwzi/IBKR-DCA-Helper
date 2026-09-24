# DCA Helper Requirements

## Scope

DCA Helper is a local Windows desktop app for calculating manual dollar-cost averaging suggestions for a user-defined portfolio.

The app must not auto-trade, must not require IBKR login, and must not require localhost or a separate browser session. The final deliverable must run as a Windows `.exe`.

## Portfolio Rules

- The app must start with an empty portfolio on first launch.
- Do not add, preload, seed, recommend, or assume any default stocks, ETFs, or ticker symbols.
- The app must use only the tickers manually added by the user.
- The app must support any custom portfolio, not only AI-focused stocks or ETFs.
- Examples such as `QQQM`, `SMH`, `NVDA`, `CGL.C`, `FBTC`, `XEQT`, and `VFV` may be used in documentation or tests only as examples. They must not be preloaded into the app.

## Portfolio Item Fields

Each user-added stock or ETF must store:

- Ticker symbol
- Display name
- Yahoo/price symbol
- Currency: `CAD` or `USD`
- Target percentage
- Current shares owned
- Optional manual price override
- Enabled/disabled toggle

The display ticker must remain separate from the price symbol so users can use broker-style display names while still entering Yahoo-compatible price symbols.

Examples:

- U.S. stocks or ETFs may use price symbols such as `NVDA`, `QQQM`, or `SMH`.
- Canadian stocks or ETFs may use Yahoo-style price symbols such as `CGL-C.TO` or `VFV.TO`.

## Portfolio Management

The user must be able to:

- Add any ticker manually.
- Edit any ticker.
- Delete any ticker.
- Enable or disable any ticker.
- Save the portfolio locally with SQLite.
- Save app settings locally.

## Add Stock Form

The Add Stock form must include:

- Ticker
- Name
- Price symbol
- Currency
- Target %
- Current shares
- Save button

Manual price override and enabled/disabled controls may be shown in add/edit flows as needed, but the minimum Add Stock form fields above are required.

## Target Percentage

- Do not force any default target percentage.
- Show a warning if the total target percentage for enabled holdings is not exactly `100%`.
- Allow the user to keep editing until the total target percentage equals `100%`.
- The app must not silently normalize target percentages.

## Pricing

The app must include:

- Refresh prices button.
- Manual price override support if the price API fails or the user wants to override a price.

Price conversion rules:

```text
priceCAD = price if currency is CAD
priceCAD = USD price x USDCAD rate if currency is USD
```

## DCA Calculation

The DCA calculation must be generic and must use only enabled tickers added by the user.

For each ticker:

```text
currentValueCAD = sharesOwned x priceCAD

portfolioAfterCash = currentPortfolioValue + cashToInvest

targetValueCAD = targetPercent x portfolioAfterCash

gapToTargetCAD = targetValueCAD - currentValueCAD

changePercent = ((lastPrice - previousClose) / previousClose) x 100
```

`targetPercent` is the user's target percentage expressed as a decimal in calculations. For example, `25%` is `0.25`.

## Decision Rules

For each ticker:

- If data is missing: `SKIP`
- If target percent is missing or zero: `SKIP`
- If `changePercent` is not red enough: `WAIT`
- If `gapToTargetCAD <= 0`: `WAIT`
- Otherwise: `BUY`

## Suggested Buy

```text
normalSplitCAD = cashToInvest x targetPercent
```

Dip multiplier:

- `1.00` if `changePercent <= minimumDip`
- `1.25` if `changePercent <= biggerDipThreshold`
- `1.50` if `changePercent <= hugeDipThreshold`

The suggested buy amount is:

```text
suggestedBuyCAD = min(normalSplitCAD x dipMultiplier, gapToTargetCAD, cashToInvest)
```

## Best Buy Today

Only compare tickers with a `BUY` action.

Pick the ticker with the highest score:

```text
underTargetScore = min(gapToTargetCAD / normalSplitCAD, 1) x 60
dipScore = min(abs(changePercent) / 5, 1) x 40
score = underTargetScore + dipScore
```

## History And Export

- The app must keep local calculation/history data as needed.
- The user must be able to export history to CSV.

## Explicit Non-Requirements

- No auto-trading.
- No IBKR login.
- No default tickers.
- No localhost requirement.
