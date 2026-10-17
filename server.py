"""
LAS VEGAS HOLD'EM — 선택형 Python 백엔드 엔진

    python server.py            → http://localhost:8765 에서 게임 실행 + 고수 AI 승률 엔진 제공

index.html 은 백엔드 없이도 브라우저에서 바로 실행됩니다 (JS 내장 엔진).
백엔드가 켜져 있으면 '고수' AI가 이 서버의 몬테카를로 승률 계산(/api/equity)을 사용합니다.
표준 라이브러리만 사용하므로 별도 설치가 필요 없습니다.
"""
import json
import os
import random
import sys
import webbrowser
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))
PORT = int(os.environ.get("PORT", "8765"))

# ---------------------------------------------------------------- evaluator
# 카드: 0..51, rank = (c >> 2) + 2, suit = c & 3  (js/cards.js 와 동일)
B = [16 ** 5, 16 ** 4, 16 ** 3, 16 ** 2, 16, 1]


def _score(cat, ks):
    s = cat * B[0]
    for i, k in enumerate(ks[:5]):
        s += k * B[i + 1]
    return s


def _straight_high(mask):
    if mask & (1 << 14):
        mask |= 2
    for h in range(14, 4, -1):
        if ((mask >> (h - 4)) & 31) == 31:
            return h
    return 0


def _top(mask, n):
    out = []
    for r in range(14, 1, -1):
        if mask & (1 << r):
            out.append(r)
            if len(out) == n:
                break
    return out


def evaluate(cards):
    rc = [0] * 15
    sc = [0] * 4
    sm = [0] * 4
    mask = 0
    for c in cards:
        r, s = (c >> 2) + 2, c & 3
        rc[r] += 1
        sc[s] += 1
        sm[s] |= 1 << r
        mask |= 1 << r
    fs = next((s for s in range(4) if sc[s] >= 5), -1)
    if fs >= 0:
        sf = _straight_high(sm[fs])
        if sf:
            return _score(9 if sf == 14 else 8, [sf])
    quad, trips, pairs = 0, [], []
    for r in range(14, 1, -1):
        if rc[r] == 4:
            quad = r
        elif rc[r] == 3:
            trips.append(r)
        elif rc[r] == 2:
            pairs.append(r)
    if quad:
        return _score(7, [quad] + _top(mask & ~(1 << quad), 1))
    if trips and (len(trips) > 1 or pairs):
        p = max(trips[1] if len(trips) > 1 else 0, pairs[0] if pairs else 0)
        return _score(6, [trips[0], p])
    if fs >= 0:
        return _score(5, _top(sm[fs], 5))
    st = _straight_high(mask)
    if st:
        return _score(4, [st])
    if trips:
        return _score(3, [trips[0]] + _top(mask & ~(1 << trips[0]), 2))
    if len(pairs) >= 2:
        return _score(2, [pairs[0], pairs[1]] + _top(mask & ~(1 << pairs[0]) & ~(1 << pairs[1]), 1))
    if pairs:
        return _score(1, [pairs[0]] + _top(mask & ~(1 << pairs[0]), 3))
    return _score(0, _top(mask, 5))


def chen(a, b):
    r1, r2 = (a >> 2) + 2, (b >> 2) + 2
    if r2 > r1:
        r1, r2 = r2, r1
    s = {14: 10, 13: 8, 12: 7, 11: 6}.get(r1, r1 / 2)
    if r1 == r2:
        s = max(5, s * 2)
        if r1 == 5:
            s = 6
    if (a & 3) == (b & 3):
        s += 2
    gap = r1 - r2 - 1
    if r1 != r2:
        s -= {0: 0, 1: 1, 2: 2, 3: 4}.get(gap, 5)
        if gap <= 1 and r1 < 12:
            s += 1
    return -(-s // 1)


def equity(hole, board, ranges, iters):
    """레인지 가중 몬테카를로 승률. ranges: 상대별 최소 Chen 점수 (-99 = 아무 패)."""
    used = set(hole) | set(board)
    rest = [c for c in range(52) if c not in used]
    need = 5 - len(board)
    win = 0.0
    for _ in range(iters):
        deck = rest[:]
        random.shuffle(deck)
        opp_hands = []
        for rng in ranges:
            a, b = deck.pop(), deck.pop()
            tries = 0
            while rng > -99 and chen(a, b) < rng and tries < 6:
                deck.insert(0, a)
                deck.insert(0, b)
                a, b = deck.pop(), deck.pop()
                tries += 1
            opp_hands.append((a, b))
        bd = board + [deck.pop() for _ in range(need)]
        me = evaluate(hole + bd)
        lost, ties = False, 0
        for a, b in opp_hands:
            s = evaluate([a, b] + bd)
            if s > me:
                lost = True
                break
            if s == me:
                ties += 1
        if not lost:
            win += 1.0 / (ties + 1)
    return win / iters


# ---------------------------------------------------------------- server
class Handler(SimpleHTTPRequestHandler):
    def log_message(self, fmt, *args):  # 조용히
        pass

    def _json(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path.startswith("/api/health"):
            return self._json(200, {"ok": True, "engine": "python-montecarlo"})
        return super().do_GET()

    def do_POST(self):
        if not self.path.startswith("/api/equity"):
            return self._json(404, {"error": "not found"})
        try:
            n = int(self.headers.get("Content-Length", "0"))
            data = json.loads(self.rfile.read(min(n, 10000)) or b"{}")
            hole = [int(c) for c in data["hole"]][:2]
            board = [int(c) for c in data.get("board", [])][:5]
            ranges = [float(r) for r in data.get("ranges", [-99])][:9] or [-99]
            iters = max(50, min(int(data.get("iters", 1000)), 3000))
            cards = hole + board
            if len(hole) != 2 or len(set(cards)) != len(cards) or any(c < 0 or c > 51 for c in cards):
                raise ValueError("bad cards")
            return self._json(200, {"equity": equity(hole, board, ranges, iters)})
        except Exception as e:  # noqa: BLE001
            return self._json(400, {"error": str(e)})


def main():
    handler = partial(Handler, directory=ROOT)
    srv = ThreadingHTTPServer(("127.0.0.1", PORT), handler)
    url = f"http://localhost:{PORT}/"
    print(f"LAS VEGAS HOLD'EM 서버 실행 중 → {url}  (종료: Ctrl+C)")
    if "--no-browser" not in sys.argv:
        webbrowser.open(url)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
