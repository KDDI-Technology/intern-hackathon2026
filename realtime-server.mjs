import http from "node:http";
import { readFileSync, writeFileSync } from "node:fs";

const PORT = Number(process.env.REALTIME_PORT || 3001);
const clients = new Map();

const seatIds = Array.from({ length: 20 }, (_, index) => {
  const row = Math.floor(index / 4);
  const seat = index % 4;
  return `r${row}-${seat}`;
});
const SEAT_DATA_FILE = new URL("./seat-data.json", import.meta.url);
const emptySeats = () => Object.fromEntries(seatIds.map((id) => [id, false]));
let seats = emptySeats();
let seatsInitialized = false;
const LUNCH_DATA_FILE = new URL("./lunch-data.json", import.meta.url);
let lunchPosts = [];
let lunchInitialized = false;

try {
  const saved = JSON.parse(readFileSync(SEAT_DATA_FILE, "utf8"));
  seats = Object.fromEntries(seatIds.map((id) => [id, saved.seats?.[id] || false]));
  seatsInitialized = Boolean(saved.initialized);
} catch {
  // 初回起動時は空席で開始し、最初のクライアントの保存値を受け入れる
}

function saveSeats() {
  writeFileSync(SEAT_DATA_FILE, JSON.stringify({ initialized: true, seats }, null, 2));
  seatsInitialized = true;
}

try {
  const saved = JSON.parse(readFileSync(LUNCH_DATA_FILE, "utf8"));
  lunchPosts = Array.isArray(saved.posts) ? saved.posts : [];
  lunchInitialized = Boolean(saved.initialized);
} catch {
  // 初回起動時は最初のクライアントの掲示板データを受け入れる
}

function saveLunchPosts() {
  writeFileSync(LUNCH_DATA_FILE, JSON.stringify({ initialized: true, posts: lunchPosts }, null, 2));
  lunchInitialized = true;
}

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

    if (channel === "seats") sendSse(res, { t: "snapshot", seats, initialized: seatsInitialized });
    if (channel === "lunch-support") sendSse(res, { t: "snapshot", posts: lunchPosts, initialized: lunchInitialized });

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
            broadcast("seats", { t: "snapshot", seats, initialized: seatsInitialized });
          } else if (payload?.t === "set" && seatIds.includes(payload.id)) {
            seats[payload.id] = payload.seat && typeof payload.seat === "object" ? payload.seat : false;
            saveSeats();
            broadcast("seats", { t: "set", id: payload.id, seat: seats[payload.id] });
          } else if (payload?.t === "replace" && payload.seats && typeof payload.seats === "object") {
            for (const id of seatIds) seats[id] = payload.seats[id] || false;
            saveSeats();
            broadcast("seats", { t: "snapshot", seats, initialized: true });
          } else if (payload?.t === "init" && !seatsInitialized && payload.seats && typeof payload.seats === "object") {
            for (const id of seatIds) seats[id] = payload.seats[id] || false;
            saveSeats();
            broadcast("seats", { t: "snapshot", seats, initialized: true });
          }
        } else if (channel === "lunch-support") {
          if (payload?.t === "get") {
            broadcast("lunch-support", { t: "snapshot", posts: lunchPosts, initialized: lunchInitialized });
          } else if (payload?.t === "replace" && Array.isArray(payload.posts)) {
            lunchPosts = payload.posts.slice(0, 200);
            saveLunchPosts();
            broadcast("lunch-support", { t: "snapshot", posts: lunchPosts, initialized: true });
          } else if (payload?.t === "init" && !lunchInitialized && Array.isArray(payload.posts)) {
            lunchPosts = payload.posts.slice(0, 200);
            saveLunchPosts();
            broadcast("lunch-support", { t: "snapshot", posts: lunchPosts, initialized: true });
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
