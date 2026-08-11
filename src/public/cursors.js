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
      '<svg width="16" height="16" viewBox="0 0 16 16" fill="none">' +
      '<path d="M1 1l5.5 13 2-5.5L14 6.5 1 1z" fill="' +
      color +
      '" stroke="#000" stroke-width="0.75"/></svg>' +
      '<span style="' +
      [
        "display:block",
        "margin-left:14px",
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