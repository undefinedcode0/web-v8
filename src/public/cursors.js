(() => {
  const WS_HOST = "wss://web-v8-cursors.undefinedcode.workers.dev/ws";
  const MOVE_THROTTLE_MS = 40; // ~25/sec

  const room = location.pathname;
  const cursors = new Map(); // id -> { el, x, y }
  let ws = null;

  function docSize() {
    const el = document.documentElement;
    return {
      w: Math.max(el.scrollWidth, el.clientWidth, 1),
      h: Math.max(el.scrollHeight, el.clientHeight, 1),
    };
  }
  
  const CURSOR_SVG =
    '<svg width="10" height="16" viewBox="0 0 10 16" shape-rendering="crispEdges">' +
    '<rect x="0" y="0" width="2" height="1" fill="#fff"/>' +
    '<rect x="0" y="1" width="1" height="1" fill="#fff"/>' +
    '<rect x="1" y="1" width="1" height="1" fill="#000"/>' +
    '<rect x="2" y="1" width="1" height="1" fill="#fff"/>' +
    '<rect x="0" y="2" width="1" height="1" fill="#fff"/>' +
    '<rect x="1" y="2" width="2" height="1" fill="#000"/>' +
    '<rect x="3" y="2" width="1" height="1" fill="#fff"/>' +
    '<rect x="0" y="3" width="1" height="1" fill="#fff"/>' +
    '<rect x="1" y="3" width="3" height="1" fill="#000"/>' +
    '<rect x="4" y="3" width="1" height="1" fill="#fff"/>' +
    '<rect x="0" y="4" width="1" height="1" fill="#fff"/>' +
    '<rect x="1" y="4" width="4" height="1" fill="#000"/>' +
    '<rect x="5" y="4" width="1" height="1" fill="#fff"/>' +
    '<rect x="0" y="5" width="1" height="1" fill="#fff"/>' +
    '<rect x="1" y="5" width="5" height="1" fill="#000"/>' +
    '<rect x="6" y="5" width="1" height="1" fill="#fff"/>' +
    '<rect x="0" y="6" width="1" height="1" fill="#fff"/>' +
    '<rect x="1" y="6" width="6" height="1" fill="#000"/>' +
    '<rect x="7" y="6" width="1" height="1" fill="#fff"/>' +
    '<rect x="0" y="7" width="1" height="1" fill="#fff"/>' +
    '<rect x="1" y="7" width="7" height="1" fill="#000"/>' +
    '<rect x="8" y="7" width="1" height="1" fill="#fff"/>' +
    '<rect x="0" y="8" width="1" height="1" fill="#fff"/>' +
    '<rect x="1" y="8" width="8" height="1" fill="#000"/>' +
    '<rect x="9" y="8" width="1" height="1" fill="#fff"/>' +
    '<rect x="0" y="9" width="1" height="1" fill="#fff"/>' +
    '<rect x="1" y="9" width="5" height="1" fill="#000"/>' +
    '<rect x="6" y="9" width="4" height="1" fill="#fff"/>' +
    '<rect x="0" y="10" width="1" height="1" fill="#fff"/>' +
    '<rect x="1" y="10" width="2" height="1" fill="#000"/>' +
    '<rect x="3" y="10" width="1" height="1" fill="#fff"/>' +
    '<rect x="4" y="10" width="2" height="1" fill="#000"/>' +
    '<rect x="6" y="10" width="1" height="1" fill="#fff"/>' +
    '<rect x="0" y="11" width="1" height="1" fill="#fff"/>' +
    '<rect x="1" y="11" width="1" height="1" fill="#000"/>' +
    '<rect x="2" y="11" width="1" height="1" fill="#fff"/>' +
    '<rect x="4" y="11" width="1" height="1" fill="#fff"/>' +
    '<rect x="5" y="11" width="2" height="1" fill="#000"/>' +
    '<rect x="7" y="11" width="1" height="1" fill="#fff"/>' +
    '<rect x="0" y="12" width="2" height="1" fill="#fff"/>' +
    '<rect x="4" y="12" width="1" height="1" fill="#fff"/>' +
    '<rect x="5" y="12" width="2" height="1" fill="#000"/>' +
    '<rect x="7" y="12" width="1" height="1" fill="#fff"/>' +
    '<rect x="5" y="13" width="1" height="1" fill="#fff"/>' +
    '<rect x="6" y="13" width="2" height="1" fill="#000"/>' +
    '<rect x="8" y="13" width="1" height="1" fill="#fff"/>' +
    '<rect x="5" y="14" width="1" height="1" fill="#fff"/>' +
    '<rect x="6" y="14" width="2" height="1" fill="#000"/>' +
    '<rect x="8" y="14" width="1" height="1" fill="#fff"/>' +
    '<rect x="6" y="15" width="2" height="1" fill="#fff"/>' +
    '</svg>';

  function makeCursorEl(color, id) {
    const el = document.createElement("div");
    el.className = "remote-cursor";
    el.style.cssText = [
      "position:absolute",
      "top:0",
      "left:0",
      "pointer-events:none",
      "z-index:9999",
      "will-change:transform",
      "transition:transform 80ms linear",
    ].join(";");
    el.innerHTML =
      CURSOR_SVG +
      '<span style="' +
      [
        "display:block",
        "margin-left:12px",
        "margin-top:-2px",
        "font-family:'GeistMono',monospace",
        "font-size:0.65rem",
        "color:" + color,
        "white-space:nowrap",
        "opacity:0.85",
      ].join(";") +
      '">' +
      id +
      "</span>";
    document.body.appendChild(el);
    return el;
  }

  function setCursor(id, x, y, color) {
    let c = cursors.get(id);
    if (!c) {
      c = { el: makeCursorEl(color, id), x, y };
      cursors.set(id, c);
    } else {
      c.x = x;
      c.y = y;
    }
    const { w, h } = docSize();
    c.el.style.transform = `translate(${x * w}px, ${y * h}px)`;
  }

  function removeCursor(id) {
    const c = cursors.get(id);
    if (!c) return;
    c.el.remove();
    cursors.delete(id);
  }

  function repositionAll() {
    const { w, h } = docSize();
    cursors.forEach((c) => {
      c.el.style.transform = `translate(${c.x * w}px, ${c.y * h}px)`;
    });
  }

  function connect() {
    ws = new WebSocket(`${WS_HOST}?room=${encodeURIComponent(room)}`);

    ws.addEventListener("message", (event) => {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }
      if (msg.type === "sync") {
        msg.cursors.forEach((c) => setCursor(c.id, c.x, c.y, c.color));
      } else if (msg.type === "move") {
        setCursor(msg.id, msg.x, msg.y, msg.color);
      } else if (msg.type === "leave") {
        removeCursor(msg.id);
      }
    });

    ws.addEventListener("close", () => {
      cursors.forEach((c) => c.el.remove());
      cursors.clear();
      setTimeout(connect, 2000);
    });

    ws.addEventListener("error", () => ws.close());
  }

  let lastSent = 0;
  function onMove(e) {
    const now = performance.now();
    if (now - lastSent < MOVE_THROTTLE_MS) return;
    lastSent = now;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const { w, h } = docSize();
    ws.send(
      JSON.stringify({
        type: "move",
        x: e.pageX / w,
        y: e.pageY / h,
      })
    );
  }

  document.addEventListener("mousemove", onMove, { passive: true });
  window.addEventListener("resize", repositionAll);
  connect();
})();