import json
import os
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse


READ_ONLY_MODE = "read-only"
DELAYED_MESSAGE = "Using delayed IBKR data because live API market data subscription is not available."


def load_env_file():
    env_path = Path(__file__).with_name(".env")
    if not env_path.exists():
        return
    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def now_iso():
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


def mock_price(symbol):
    samples = {
        "SMH": (609.17, 611.61, "USD"),
        "NVDA": (192.26, 195.61, "USD"),
        "QQQM": (218.44, 220.12, "USD"),
    }
    last, previous, currency = samples.get(symbol.upper(), (100.0, 101.0, "USD"))
    return {
        "symbol": symbol.upper(),
        "last": last,
        "bid": round(last - 0.03, 2),
        "ask": round(last + 0.03, 2),
        "previousClose": previous,
        "currency": currency,
        "marketDataTime": now_iso(),
        "isDelayed": False,
        "status": "ok",
        "source": "IBKR",
    }


def contract_for(symbol, override=None):
    override = override or {}
    clean_symbol = (override.get("symbol") or symbol).upper()
    if clean_symbol.endswith(".TO"):
        clean_symbol = clean_symbol[:-3]
    return {
        "symbol": clean_symbol,
        "secType": (override.get("secType") or "STK").upper(),
        "exchange": (override.get("exchange") or "SMART").upper(),
        "currency": (override.get("currency") or ("CAD" if symbol.upper().endswith(".TO") else "USD")).upper(),
        "primaryExchange": (override.get("primaryExchange") or "").upper() or None,
    }


class IbkrSnapshotClient:
    def __init__(self, host, port, client_id):
        try:
            from ibapi.client import EClient
            from ibapi.contract import Contract
            from ibapi.wrapper import EWrapper
        except Exception as exc:
            raise RuntimeError("Python package ibapi is not installed. Run: py -m pip install ibapi") from exc

        class App(EWrapper, EClient):
            def __init__(self):
                EClient.__init__(self, self)
                self.Contract = Contract
                self.next_order_id = None
                self.snapshots = {}
                self.events = {}
                self.errors = {}

            def nextValidId(self, orderId):
                self.next_order_id = orderId

            def error(self, reqId, errorCode, errorString, advancedOrderRejectJson=""):
                if reqId >= 0:
                    self.errors[reqId] = {"code": int(errorCode), "message": f"IBKR {errorCode}: {errorString}"}
                    self.events.setdefault(reqId, threading.Event()).set()

            def tickPrice(self, reqId, tickType, price, attrib):
                snap = self.snapshots.setdefault(reqId, {})
                if tickType in (1, 66):
                    snap["bid"] = price
                elif tickType in (2, 67):
                    snap["ask"] = price
                elif tickType in (4, 68):
                    snap["last"] = price
                    snap["isDelayed"] = tickType == 68
                elif tickType in (9, 75):
                    snap["previousClose"] = price
                    snap["isDelayed"] = snap.get("isDelayed", tickType == 75)

            def tickString(self, reqId, tickType, value):
                if tickType == 45 and value:
                    try:
                        self.snapshots.setdefault(reqId, {})["marketDataTime"] = datetime.fromtimestamp(
                            int(value), timezone.utc
                        ).astimezone().isoformat(timespec="seconds")
                    except Exception:
                        pass

            def tickSnapshotEnd(self, reqId):
                self.events.setdefault(reqId, threading.Event()).set()

        self.app = App()
        self.host = host
        self.port = int(port)
        self.client_id = int(client_id)

    def _make_contract(self, data):
        contract = self.app.Contract()
        if data.get("conid"):
            contract.conId = int(data["conid"])
        contract.symbol = data["symbol"]
        contract.secType = data["secType"]
        contract.exchange = data["exchange"]
        contract.currency = data["currency"]
        if data.get("primaryExchange"):
            contract.primaryExchange = data["primaryExchange"]
        return contract

    def connect(self):
        self.app.connect(self.host, self.port, clientId=self.client_id)
        thread = threading.Thread(target=self.app.run, daemon=True)
        thread.start()
        deadline = time.time() + 5
        while self.app.next_order_id is None and time.time() < deadline:
            time.sleep(0.05)
        if self.app.next_order_id is None:
            raise RuntimeError("IBKR connection timed out")

    def close(self):
        try:
            self.app.disconnect()
        except Exception:
            pass

    def _snapshot_for(self, req_id, data, market_data_type, timeout=8):
        self.app.snapshots[req_id] = {}
        self.app.errors.pop(req_id, None)
        self.app.events[req_id] = threading.Event()
        self.app.reqMarketDataType(market_data_type)
        self.app.reqMktData(req_id, self._make_contract(data), "", True, False, [])
        self.app.events[req_id].wait(timeout)
        snap = self.app.snapshots.get(req_id, {})
        error = self.app.errors.get(req_id)
        return snap, error

    def _result_from_snapshot(self, symbol, data, snap, source, status, message=""):
        last = snap.get("last")
        bid = snap.get("bid")
        ask = snap.get("ask")
        if last is None and bid is not None and ask is not None:
            last = round((float(bid) + float(ask)) / 2, 4)
        return {
            "symbol": symbol.upper(),
            "last": last,
            "bid": bid,
            "ask": ask,
            "previousClose": snap.get("previousClose"),
            "currency": data["currency"],
            "marketDataTime": snap.get("marketDataTime") or now_iso(),
            "isDelayed": source == "IBKR delayed" or bool(snap.get("isDelayed")),
            "status": status if last is not None and snap.get("previousClose") is not None else "missing data",
            "source": source,
            "message": message,
        }

    def prices(self, symbols, contracts):
        self.connect()
        try:
            results = []
            for index, symbol in enumerate(symbols, start=1):
                override = next((item for item in contracts if str(item.get("symbol", "")).upper() == symbol.upper()), {})
                data = contract_for(symbol, override)
                live_snap, live_error = self._snapshot_for(index, data, 1)
                if live_snap and live_snap.get("last") is not None and live_snap.get("previousClose") is not None:
                    results.append(self._result_from_snapshot(symbol, data, live_snap, "IBKR", "ok"))
                    continue

                if live_error and live_error.get("code") != 10089 and not live_snap:
                    results.append({"symbol": symbol, "status": live_error["message"], "source": "IBKR"})
                    continue

                delayed_snap, delayed_error = self._snapshot_for(index + 10000, data, 3)
                if delayed_snap and (delayed_snap.get("last") is not None or delayed_snap.get("bid") is not None):
                    results.append(self._result_from_snapshot(symbol, data, delayed_snap, "IBKR delayed", "delayed", DELAYED_MESSAGE))
                    continue

                frozen_snap, frozen_error = self._snapshot_for(index + 20000, data, 4)
                if frozen_snap and (frozen_snap.get("last") is not None or frozen_snap.get("bid") is not None):
                    results.append(self._result_from_snapshot(symbol, data, frozen_snap, "IBKR delayed", "delayed", DELAYED_MESSAGE))
                    continue

                error_message = (
                    (delayed_error or frozen_error or live_error or {}).get("message")
                    if isinstance(delayed_error or frozen_error or live_error, dict)
                    else None
                )
                results.append({"symbol": symbol, "status": error_message or "missing data", "source": "IBKR"})
            return results
        finally:
            self.close()

    def search(self, query):
        request_id = 600001
        self.connect()
        try:
            self.app.events[request_id] = threading.Event()
            self.app.errors.pop(request_id, None)
            self.app.matches = []

            def symbol_samples(req_id, descriptions):
                if req_id != request_id:
                    return
                self.app.matches = descriptions or []
                self.app.events[request_id].set()

            self.app.symbolSamples = symbol_samples
            self.app.reqMatchingSymbols(str(query))
            self.app.events[request_id].wait(8)
            error = self.app.errors.get(request_id)
            if error:
                raise RuntimeError(error["message"])
            results = []
            for description in self.app.matches[:20]:
                contract = description.contract
                if contract.secType not in ("STK", "ETF", "IND"):
                    continue
                results.append({
                    "symbol": contract.symbol,
                    "name": getattr(description, "derivativeSecTypes", None) and contract.localSymbol or contract.symbol,
                    "exchange": contract.exchange,
                    "primaryExchange": contract.primaryExchange,
                    "currency": contract.currency,
                    "secType": contract.secType,
                    "conid": contract.conId,
                })
            return results
        finally:
            self.close()

    def history(self, contract_data, duration, bar_size):
        request_id = 600002
        self.connect()
        try:
            self.app.events[request_id] = threading.Event()
            self.app.errors.pop(request_id, None)
            self.app.historical_bars = []

            def historical_data(req_id, bar):
                if req_id == request_id:
                    self.app.historical_bars.append(bar)

            def historical_data_end(req_id, start, end):
                if req_id == request_id:
                    self.app.events[request_id].set()

            self.app.historicalData = historical_data
            self.app.historicalDataEnd = historical_data_end
            self.app.reqHistoricalData(request_id, self._make_contract(contract_data), "", str(duration), str(bar_size), "TRADES", 1, 2, False, [])
            self.app.events[request_id].wait(18)
            error = self.app.errors.get(request_id)
            if error:
                raise RuntimeError(error["message"])
            bars = []
            for bar in self.app.historical_bars:
                try:
                    timestamp = int(float(bar.date))
                    bars.append({
                        "time": timestamp,
                        "open": float(bar.open), "high": float(bar.high), "low": float(bar.low), "close": float(bar.close),
                        "volume": float(bar.volume) if bar.volume not in (None, "", -1) else None,
                    })
                except (TypeError, ValueError):
                    continue
            if not bars:
                raise RuntimeError("IBKR returned no historical bars. Check market-data permissions and the contract.")
            latest = bars[-1]
            return {
                "instrument": {"name": contract_data["symbol"], "exchange": contract_data.get("primaryExchange") or contract_data["exchange"], "currency": contract_data["currency"]},
                "bars": bars,
                "quote": {"price": latest["close"], "timestamp": latest["time"], "marketState": "HISTORICAL"},
                "isDelayed": False,
            }
        finally:
            self.close()


def get_prices(symbols, contracts):
    if os.environ.get("DCA_RELAY_MOCK") == "1":
        prices = [mock_price(symbol) for symbol in symbols]
        if os.environ.get("DCA_RELAY_MOCK_DELAYED") == "1":
            for price in prices:
                price["source"] = "IBKR delayed"
                price["isDelayed"] = True
                price["status"] = "delayed"
                price["message"] = DELAYED_MESSAGE
        return prices
    client = IbkrSnapshotClient(
        os.environ.get("IBKR_HOST", "127.0.0.1"),
        os.environ.get("IBKR_PORT", "4001"),
        os.environ.get("IBKR_CLIENT_ID", "9171"),
    )
    return client.prices(symbols, contracts)


def get_search(query):
    if os.environ.get("DCA_RELAY_MOCK") == "1":
        return []
    return IbkrSnapshotClient(os.environ.get("IBKR_HOST", "127.0.0.1"), os.environ.get("IBKR_PORT", "4001"), os.environ.get("IBKR_CLIENT_ID", "9171")).search(query)


def get_history(contract, duration, bar_size):
    if os.environ.get("DCA_RELAY_MOCK") == "1":
        raise RuntimeError("Mock relay does not generate chart prices.")
    return IbkrSnapshotClient(os.environ.get("IBKR_HOST", "127.0.0.1"), os.environ.get("IBKR_PORT", "4001"), os.environ.get("IBKR_CLIENT_ID", "9171")).history(contract, duration, bar_size)


class Handler(BaseHTTPRequestHandler):
    def _json(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        path = self.path.split("?")[0]
        print(f"{self.address_string()} {self.command} {path}")

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/health":
            self._json(200, {"ok": True, "ibkrConnected": os.environ.get("DCA_RELAY_MOCK") == "1", "mode": READ_ONLY_MODE})
            return

        if parsed.path not in ("/prices", "/search", "/history"):
            self._json(404, {"ok": False, "error": "Not found"})
            return

        expected_key = os.environ.get("DCA_RELAY_API_KEY", "")
        supplied_key = self.headers.get("x-api-key", "")
        if not expected_key or supplied_key != expected_key:
            self._json(401, {"ok": False, "error": "Unauthorized"})
            return

        query = parse_qs(parsed.query)
        if parsed.path == "/search":
            value = str(query.get("q", [""])[0]).strip()
            if not value:
                self._json(400, {"ok": False, "error": "q query is required"})
                return
            try:
                self._json(200, {"ok": True, "source": "IBKR", "results": get_search(value)})
            except Exception as exc:
                self._json(503, {"ok": False, "error": str(exc)})
            return

        if parsed.path == "/history":
            try:
                contract = json.loads(query.get("contract", ["{}"])[0] or "{}")
                if not isinstance(contract, dict) or not contract.get("symbol"):
                    raise ValueError("A chart contract is required")
                result = get_history(contract_for(contract.get("symbol"), contract), query.get("duration", ["1 Y"])[0], query.get("barSize", ["1 day"])[0])
                self._json(200, {"ok": True, "source": "IBKR", **result})
            except Exception as exc:
                self._json(503, {"ok": False, "error": str(exc)})
            return

        symbols = [item.strip().upper() for item in ",".join(query.get("symbols", [])).split(",") if item.strip()]
        if not symbols:
            self._json(400, {"ok": False, "error": "symbols query is required"})
            return

        try:
            contracts = json.loads(query.get("contracts", ["[]"])[0] or "[]")
            if not isinstance(contracts, list):
                contracts = []
        except Exception:
            contracts = []

        try:
            prices = get_prices(symbols, contracts)
            source = "IBKR delayed" if any(price.get("source") == "IBKR delayed" or price.get("isDelayed") for price in prices) else "IBKR"
            self._json(200, {"ok": True, "source": source, "prices": prices})
        except Exception as exc:
            self._json(503, {"ok": False, "error": str(exc)})


def main():
    load_env_file()
    host = os.environ.get("RELAY_HOST") or os.environ.get("DCA_RELAY_HOST", "127.0.0.1")
    port = int(os.environ.get("DCA_RELAY_PORT", "8787"))
    server = ThreadingHTTPServer((host, port), Handler)
    print(f"ibkr-price-relay listening on http://{host}:{port} ({READ_ONLY_MODE})")
    server.serve_forever()


if __name__ == "__main__":
    main()
