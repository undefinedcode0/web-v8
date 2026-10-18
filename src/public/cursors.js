(() => {
  if (matchMedia("(pointer: coarse)").matches) return;

  const WS_HOST = "wss://web-v8-cursors.undefinedcode.workers.dev/ws";
  const MOVE_THROTTLE_MS = 40;
  const HEARTBEAT_MS = 12000;
  const REF_W = 1400;

  const room = location.pathname.replace(/(\/index)?(\.html)?\/?$/, "") || "/";
  const cursors = new Map();
  const box = { left: 0, h: 1 };
  let ws = null;
  let retry = 0;
  let timer = null;
  let lastSent = 0;

  const ART = [
    "ww........",
    "wbw.......",
    "wbbw......",
    "wbbbw.....",
    "wbbbbw....",
    "wbbbbbw...",
    "wbbbbbbw..",
    "wbbbbbbbw.",
    "wbbbbbbbbw",
    "wbbbbbwwww",
    "wbbwbbw...",
    "wbw.wbbw..",
    "ww..wbbw..",
    ".....wbbw.",
    ".....wbbw.",
    "......ww..",
  ];
  const FILL = { w: "#fff", b: "#000" };
  const rects = ART.flatMap((row, y) =>
    [...row].flatMap((c, x) =>
      FILL[c] ? [`<rect x="${x}" y="${y}" width="1" height="1" fill="${FILL[c]}"/>`] : []
    )
  ).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="16" shape-rendering="crispEdges">${rects}</svg>`;

  const style = document.createElement("style");
  style.textContent = `
.remote-cursor{position:absolute;top:0;left:0;pointer-events:none;z-index:9999;will-change:transform;transition:transform 80ms linear}
.remote-cursor i{display:block;width:10px;height:16px;background:url("data:image/svg+xml,${encodeURIComponent(svg)}")}
.remote-cursor span{display:block;margin:-2px 0 0 12px;font-size:.65rem;white-space:nowrap;opacity:.85}
@media (prefers-reduced-motion:reduce){.remote-cursor{transition:none}}`;
  document.head.append(style);

  const safeColor = (c) => (/^#[0-9a-f]{3,8}$/i.test(c) ? c : "#aaa");

  function measure() {
    const grid = document.querySelector(".site-grid");
    box.left = grid ? grid.getBoundingClientRect().left + window.scrollX : 0;
    box.h = Math.max(document.documentElement.scrollHeight, 1);
  }

  function place(c) {
    const maxX = Math.max(0, document.documentElement.clientWidth - 70);
    const px = Math.min(box.left + c.x * REF_W, maxX);
    const py = Math.min(c.y * box.h, Math.max(0, box.h - 20));
    c.el.style.transform = `translate(${px}px,${py}px)`;
  }

  function makeEl(id, color) {
    const el = document.createElement("div");
    el.className = "remote-cursor";
    el.setAttribute("aria-hidden", "true");
    const label = document.createElement("span");
    label.textContent = id;
    label.style.color = safeColor(color);
    el.append(document.createElement("i"), label);
    document.body.append(el);
    return el;
  }

  function setCursor(id, x, y, color) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    let c = cursors.get(id);
    if (!c) {
      c = { el: makeEl(id, color), x, y };
      cursors.set(id, c);
    }
    c.x = x;
    c.y = y;
    place(c);
  }

  function removeCursor(id) {
    const c = cursors.get(id);
    if (!c) return;
    c.el.remove();
    cursors.delete(id);
  }

  function clearCursors() {
    cursors.forEach((c) => c.el.remove());
    cursors.clear();
  }

  function onMessage(event) {
    if (event.data === "pong") return;
    let msg;
    try {
      msg = JSON.parse(event.data);
    } catch {
      return;
    }
    if (msg.type === "sync" && Array.isArray(msg.cursors)) {
      msg.cursors.forEach((c) => setCursor(c.id, c.x, c.y, c.color));
    } else if (msg.type === "move") {
      setCursor(msg.id, msg.x, msg.y, msg.color);
    } else if (msg.type === "leave") {
      removeCursor(msg.id);
    }
  }

  function connect() {
    if (ws || document.hidden) return;
    const sock = new WebSocket(`${WS_HOST}?room=${encodeURIComponent(room)}`);
    ws = sock;
    let hb = null;

    sock.addEventListener("open", () => {
      retry = 0;
      hb = setInterval(() => {
        if (sock.readyState === WebSocket.OPEN) sock.send("ping");
      }, HEARTBEAT_MS);
    });

    sock.addEventListener("message", onMessage);

    sock.addEventListener("close", () => {
      clearInterval(hb);
      if (ws !== sock) return;
      ws = null;
      clearCursors();
      if (document.hidden) return;
      const delay = Math.min(30000, 1000 * 2 ** retry++) * (0.5 + Math.random() / 2);
      timer = setTimeout(connect, delay);
    });

    sock.addEventListener("error", () => sock.close());
  }

  function disconnect() {
    clearTimeout(timer);
    const sock = ws;
    ws = null;
    clearCursors();
    if (sock) sock.close();
  }

  function onMove(e) {
    const now = performance.now();
    if (now - lastSent < MOVE_THROTTLE_MS) return;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    lastSent = now;
    ws.send(
      JSON.stringify({
        type: "move",
        x: (e.pageX - box.left) / REF_W,
        y: e.pageY / box.h,
      })
    );
  }

  new ResizeObserver(() => {
    measure();
    cursors.forEach(place);
  }).observe(document.body);

  document.addEventListener("mousemove", onMove, { passive: true });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      disconnect();
    } else {
      retry = 0;
      connect();
    }
  });

  window.addEventListener("pagehide", disconnect);
  window.addEventListener("pageshow", (e) => {
    if (e.persisted) {
      retry = 0;
      connect();
    }
  });

  measure();
  connect();
})();