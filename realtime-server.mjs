import http from "node:http";

const PORT = Number(process.env.REALTIME_PORT || 3001);
const clients = new Map();

const seatIds = Array.from({ length: 20 }, (_, index) => {
  const row = Math.floor(index / 4);
  const seat = index % 4;
  return `r${row}-${seat}`;
});
const seats = Object.fromEntries(seatIds.map((id) => [id, false]));

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function sendSse(res, payload) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function broadcast(channel, payload) {
  for (const res of clients.get(channel) || []) sendSse(res, payload);
}

const server = http.createServer((req, res) => {
  cors(res);
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "GET" && url.pathname === "/events") {
    const channel = url.searchParams.get("channel") || "default";
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    res.write(": connected\n\n");

    if (!clients.has(channel)) clients.set(channel, new Set());
    clients.get(channel).add(res);

    if (channel === "seats") sendSse(res, { t: "snapshot", seats });

    req.on("close", () => {
      clients.get(channel)?.delete(res);
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/message") {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 100_000) req.destroy();
    });
    req.on("end", () => {
      try {
        const { channel, payload } = JSON.parse(body || "{}");

        if (channel === "seats") {
          if (payload?.t === "get") {
            broadcast("seats", { t: "snapshot", seats });
          } else if (payload?.t === "set" && seatIds.includes(payload.id)) {
            seats[payload.id] = !!payload.occupied;
            broadcast("seats", { t: "set", id: payload.id, occupied: seats[payload.id] });
          } else if (payload?.t === "replace" && payload.seats && typeof payload.seats === "object") {
            for (const id of seatIds) seats[id] = !!payload.seats[id];
            broadcast("seats", { t: "snapshot", seats });
          }
        } else if (channel === "ogori") {
          broadcast("ogori", payload);
        }

        res.writeHead(204);
        res.end();
      } catch (error) {
        res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Invalid message");
      }
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, clients: [...clients.values()].reduce((n, set) => n + set.size, 0) }));
    return;
  }

  res.writeHead(404);
  res.end();
});

setInterval(() => {
  for (const set of clients.values()) {
    for (const res of set) res.write(": ping\n\n");
  }
}, 20_000).unref();

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Realtime server running on http://0.0.0.0:${PORT}`);
});
