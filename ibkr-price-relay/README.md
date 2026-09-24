# ibkr-price-relay

Small read-only price relay for DCA Helper.

Flow:

IB Gateway on the server at `127.0.0.1:4001` -> this relay API -> DCA Helper with an API key.

This service does not place orders and does not use account or trading APIs.

## Setup

Install the official IB Python API package on the server:

```powershell
python -m pip install ibapi
```

Start the relay manually:

```powershell
$env:DCA_RELAY_API_KEY = "choose-a-long-random-secret"
$env:RELAY_HOST = "127.0.0.1"
$env:DCA_RELAY_PORT = "8787"
$env:IBKR_HOST = "127.0.0.1"
$env:IBKR_PORT = "4001"
python .\relay.py
```

Or use the included runner:

```powershell
.\start-relay.bat
```

You can also copy `.env.example` to `.env` and edit values there. The relay reads `.env` on startup and does not log the API key.

Default host is safe:

```powershell
$env:RELAY_HOST = "127.0.0.1"
```

For laptop access over LAN, VPN, or Tailscale:

```powershell
$env:RELAY_HOST = "0.0.0.0"
```

Only expose `0.0.0.0:8787` through LAN, VPN, Tailscale, or a firewall-protected network. Do not expose it publicly without HTTPS and the API key. Do not expose IB Gateway port `4001` publicly.

## Delayed IBKR Data

The relay tries live IBKR market data first. If IBKR returns error `10089` because the account does not have live API market data subscription, the relay retries delayed market data with `reqMarketDataType(3)`. If regular delayed data is empty after market close, it retries delayed frozen data with `reqMarketDataType(4)`.

Delayed rows return:

```json
{
  "source": "IBKR delayed",
  "isDelayed": true,
  "status": "delayed",
  "message": "Using delayed IBKR data because live API market data subscription is not available."
}
```

## Endpoints

`GET /health`

`GET /prices?symbols=SMH,NVDA,QQQM`

Header:

`x-api-key: your-own-secret`

Optional contract overrides can be sent as URL-encoded JSON in `contracts`.

## Mock test mode

```powershell
$env:DCA_RELAY_MOCK = "1"
$env:DCA_RELAY_API_KEY = "test-key"
python .\relay.py
```

## Test Commands

Health:

```powershell
Invoke-RestMethod "http://127.0.0.1:8787/health"
```

Prices:

```powershell
Invoke-RestMethod "http://127.0.0.1:8787/prices?symbols=SMH,NVDA,QQQM" -Headers @{"x-api-key"="your-own-secret"}
```

DCA Helper settings:

```text
IBKR Relay URL = http://SERVER-IP:8787
IBKR Relay API key = your own secret
```
