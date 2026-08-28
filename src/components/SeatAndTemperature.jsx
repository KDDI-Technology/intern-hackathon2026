import { useEffect, useRef, useState } from "react";
import { createRealtimeChannel } from "../realtime";
import { Armchair, User, RefreshCw, Thermometer } from "lucide-react";

const TEMP_STORAGE_KEY = "tempmap:v1";

// レイアウト定義: 窓側から順に「4席の列」と「通路」を並べる
const LAYOUT = [
  { type: "seats", count: 4 },
  { type: "aisle" },
  { type: "seats", count: 4 },
  { type: "seats", count: 4 },
  { type: "aisle" },
  { type: "seats", count: 4 },
  { type: "seats", count: 4 },
];

function buildSeatIds() {
  const ids = [];
  let rowIndex = 0;
  LAYOUT.forEach((block) => {
    if (block.type === "seats") {
      for (let i = 0; i < block.count; i++) {
        ids.push(`r${rowIndex}-${i}`);
      }
      rowIndex++;
    }
  });
  return ids;
}

const SEAT_IDS = buildSeatIds();
const PAIR_ID_OF_SEAT = {};
SEAT_IDS.forEach((id, idx) => {
  PAIR_ID_OF_SEAT[id] = `p${Math.floor(idx / 2)}`;
});

const DEFAULT_TEMPS = {
  p0: 24.84,
  p1: 24.36,
  p2: 25.42,
  p3: 25.3,
  p4: 26.0,
  p5: 25.74,
  p6: 24.88,
  p7: 25.41,
  p8: 25.1,
  p9: 25.34,
};

function tempColor(value) {
  if (value === undefined || value === null || value === "") {
    return { bg: "#f5f4f2", text: "#a8a29e", border: "#d6d3d1" };
  }
  const v = Number(value);
  if (v < 21) return { bg: "#dbeafe", text: "#2563eb", border: "#93c5fd" };
  if (v < 26) return { bg: "#dcfce7", text: "#16a34a", border: "#86efac" };
  return { bg: "#fee2e2", text: "#dc2626", border: "#fca5a5" };
}

// ── 永続化ヘルパー（ブラウザの localStorage を使用） ───────
// 本番で座席状況をサーバー・複数端末間で共有したい場合は、
// ここを /api/seats などの自前バックエンド呼び出しに差し替えてください。
function loadJSON(key) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveJSON(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function SeatsView() {
  const emptySeats = () => {
    const s = {};
    SEAT_IDS.forEach((id) => (s[id] = false));
    return s;
  };

  const [seats, setSeats] = useState(emptySeats);
  const [saving, setSaving] = useState(false);
  const [connected, setConnected] = useState(false);
  const [selectedSeat, setSelectedSeat] = useState(null);
  const chRef = useRef(null);

  useEffect(() => {
    const ch = createRealtimeChannel("seats");
    chRef.current = ch;

    ch.onopen = () => {
      setConnected(true);
      ch.postMessage({ t: "get" });
    };
    ch.onerror = () => setConnected(false);
    ch.onmessage = (event) => {
      const m = event.data;
      if (m.t === "snapshot" && m.seats) {
        setSeats((prev) => ({ ...prev, ...m.seats }));
        setSaving(false);
      } else if (m.t === "set" && SEAT_IDS.includes(m.id)) {
        setSeats((prev) => ({ ...prev, [m.id]: !!m.occupied }));
        setSaving(false);
      }
    };

    return () => ch.close();
  }, []);

  const selectSeat = (id) => setSelectedSeat(id);

  const setStatus = (isOccupied) => {
    if (!selectedSeat) return;
    setSaving(true);
    chRef.current?.postMessage({ t: "set", id: selectedSeat, occupied: isOccupied });
    setSelectedSeat(null);
  };

  const clearAll = () => {
    const next = emptySeats();
    setSaving(true);
    setSelectedSeat(null);
    chRef.current?.postMessage({ t: "replace", seats: next });
  };

  const total = SEAT_IDS.length;
  const occupiedCount = Object.values(seats).filter(Boolean).length;
  const availableCount = total - occupiedCount;

  let rowIndex = 0;

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 12,
          marginBottom: "1.25rem",
        }}
      >
        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ background: "#f5f4f2", borderRadius: "8px", padding: "0.5rem 0.875rem", minWidth: 76 }}>
            <p style={{ fontSize: 12, color: "#57534e", margin: 0 }}>空席</p>
            <p style={{ fontSize: 20, fontWeight: 500, margin: 0 }}>{availableCount}</p>
          </div>
          <div style={{ background: "#f5f4f2", borderRadius: "8px", padding: "0.5rem 0.875rem", minWidth: 76 }}>
            <p style={{ fontSize: 12, color: "#57534e", margin: 0 }}>着席</p>
            <p style={{ fontSize: 20, fontWeight: 500, margin: 0 }}>{occupiedCount}</p>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: connected ? "#16a34a" : "#dc2626" }}>
            {connected ? "● リアルタイム接続中" : "● 接続待ち"}
          </span>
          {saving && <span style={{ fontSize: 12, color: "#a8a29e" }}>同期中…</span>}
          <button
            onClick={clearAll}
            disabled={!connected}
            style={{ fontSize: 13, display: "inline-flex", alignItems: "center", gap: 4, cursor: connected ? "pointer" : "not-allowed" }}
          >
            <RefreshCw size={14} aria-hidden="true" />
            全部空席にする
          </button>
        </div>
      </div>

      {selectedSeat ? (
        <div
          style={{
            background: "#f5f4f2",
            borderRadius: 12,
            padding: "2.5rem 1.25rem",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 20,
            minHeight: 260,
          }}
        >
          <div style={{ width: 64, height: 64, borderRadius: "50%", background: "#ffffff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 500 }}>
            {SEAT_IDS.indexOf(selectedSeat) + 1}
          </div>
          <span style={{ fontSize: 14, color: "#57534e" }}>
            {SEAT_IDS.indexOf(selectedSeat) + 1}番の状態を選択
          </span>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => setStatus(false)} disabled={!connected} style={{ fontSize: 14, color: "#57534e", padding: "0.5rem 1rem", display: "inline-flex", alignItems: "center", gap: 6, cursor: connected ? "pointer" : "not-allowed" }}>
              <Armchair size={16} aria-hidden="true" />空き
            </button>
            <button onClick={() => setStatus(true)} disabled={!connected} style={{ fontSize: 14, color: "#dc2626", borderColor: "#ef4444", padding: "0.5rem 1rem", display: "inline-flex", alignItems: "center", gap: 6, cursor: connected ? "pointer" : "not-allowed" }}>
              <User size={16} aria-hidden="true" />使用中
            </button>
          </div>
          <button onClick={() => setSelectedSeat(null)} aria-label="キャンセル" style={{ fontSize: 13, color: "#a8a29e", cursor: "pointer" }}>キャンセル</button>
        </div>
      ) : (
        <div style={{ background: "#f5f4f2", borderRadius: 12, padding: "2rem", display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={{ width: "100%", maxWidth: 300, textAlign: "center", fontSize: 17, fontWeight: 500, color: "#57534e", borderBottom: "0.5px solid #e7e5e4", paddingBottom: 12, marginBottom: 18 }}>窓</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14, width: "100%", maxWidth: 300 }}>
            {LAYOUT.map((block, blockIdx) => {
              if (block.type === "aisle") return <div key={`aisle-${blockIdx}`} style={{ textAlign: "center", fontSize: 17, fontWeight: 500, color: "#57534e", padding: "2px 0" }}>通路</div>;
              const currentRow = rowIndex;
              rowIndex++;
              return (
                <div key={`row-${blockIdx}`} style={{ display: "flex", justifyContent: "center", border: "0.5px solid #d6d3d1", borderRadius: 8, overflow: "hidden", width: "fit-content", margin: "0 auto" }}>
                  {Array.from({ length: block.count }).map((_, seatIdx) => {
                    const id = `r${currentRow}-${seatIdx}`;
                    const isOccupied = !!seats[id];
                    const seatNumber = SEAT_IDS.indexOf(id) + 1;
                    return (
                      <button
                        key={id}
                        onClick={() => selectSeat(id)}
                        disabled={!connected}
                        aria-label={`${seatNumber}番 ${isOccupied ? "着席中" : "空席"}`}
                        aria-pressed={isOccupied}
                        style={{
                          width: 56, height: 56, padding: 0, borderRadius: 0, border: "none",
                          borderRight: seatIdx < block.count - 1 ? "0.5px solid #d6d3d1" : "none",
                          background: isOccupied ? "#fee2e2" : "#ffffff",
                          color: isOccupied ? "#dc2626" : "#57534e",
                          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                          cursor: connected ? "pointer" : "not-allowed",
                        }}
                      >
                        <span style={{ fontSize: 17, fontWeight: 500 }}>{seatNumber}</span>
                        {isOccupied ? <User size={15} aria-hidden="true" color="#dc2626" /> : <Armchair size={15} aria-hidden="true" color="#57534e" />}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <p style={{ fontSize: 12, color: "#a8a29e", marginTop: 12, textAlign: "center" }}>
        変更は同じネットワーク上の端末へリアルタイムに反映されます。
      </p>
    </div>
  );
}

function TemperatureView() {
  const [temps] = useState(() => {
    const stored = loadJSON(TEMP_STORAGE_KEY) || {};
    const merged = { ...stored, ...DEFAULT_TEMPS };
    saveJSON(TEMP_STORAGE_KEY, merged);
    return merged;
  });

  let rowIndex = 0;

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexWrap: "wrap",
          gap: 16,
          marginBottom: "1.25rem",
          fontSize: 12,
          color: "#57534e",
        }}
      >
        <span>
          <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, background: "#dbeafe", border: "1px solid #93c5fd", marginRight: 4, verticalAlign: -1 }}></span>
          21°C未満
        </span>
        <span>
          <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, background: "#dcfce7", border: "1px solid #86efac", marginRight: 4, verticalAlign: -1 }}></span>
          21〜25.9°C
        </span>
        <span>
          <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, background: "#fee2e2", border: "1px solid #fca5a5", marginRight: 4, verticalAlign: -1 }}></span>
          26°C以上
        </span>
      </div>

      <div
        style={{
          background: "#f5f4f2",
          borderRadius: 12,
          padding: "2rem",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: 300,
            textAlign: "center",
            fontSize: 17,
            fontWeight: 500,
            color: "#57534e",
            borderBottom: "0.5px solid #e7e5e4",
            paddingBottom: 12,
            marginBottom: 18,
          }}
        >
          窓
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14, width: "100%", maxWidth: 300 }}>
          {LAYOUT.map((block, blockIdx) => {
            if (block.type === "aisle") {
              return (
                <div key={`aisle-${blockIdx}`} style={{ textAlign: "center", fontSize: 17, fontWeight: 500, color: "#57534e", padding: "2px 0" }}>
                  通路
                </div>
              );
            }
            const currentRow = rowIndex;
            rowIndex++;
            return (
              <div key={`row-${blockIdx}`} style={{ display: "flex", justifyContent: "center", gap: 10 }}>
                {[0, 1].map((groupIdx) => {
                  const seatIdxA = groupIdx * 2;
                  const seatIdxB = groupIdx * 2 + 1;
                  const idA = `r${currentRow}-${seatIdxA}`;
                  const idB = `r${currentRow}-${seatIdxB}`;
                  const seatNumberA = SEAT_IDS.indexOf(idA) + 1;
                  const seatNumberB = SEAT_IDS.indexOf(idB) + 1;
                  const pairId = PAIR_ID_OF_SEAT[idA];
                  const value = temps[pairId];
                  const colors = tempColor(value);
                  return (
                    <div
                      key={groupIdx}
                      aria-label={`${seatNumberA}・${seatNumberB}番 ${value !== undefined ? value + "度" : "未記録"}`}
                      style={{
                        width: 112,
                        height: 56,
                        borderRadius: 8,
                        border: "0.5px solid #d6d3d1",
                        background: colors.bg,
                        color: colors.text,
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <span style={{ fontSize: 11, opacity: 0.8 }}>
                        {seatNumberA}・{seatNumberB}
                      </span>
                      <span style={{ fontSize: 15, fontWeight: 500 }}>
                        {value !== undefined ? `${value}°` : "-"}
                      </span>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      <p style={{ fontSize: 12, color: "#a8a29e", marginTop: 12, textAlign: "center" }}>
        温度は自動で記録されたものを表示しています(閲覧専用)。
      </p>
    </div>
  );
}

export default function SeatAndTemperature() {
  const [activeTab, setActiveTab] = useState("seats");

  return (
    <div style={{ padding: "0.5rem 0" }}>
      {activeTab === "seats" ? <SeatsView /> : <TemperatureView />}

      <div
        style={{
          display: "flex",
          background: "#ffffff",
          border: "0.5px solid #e7e5e4",
          borderRadius: 12,
          overflow: "hidden",
          marginTop: "1.5rem",
        }}
      >
        <button
          onClick={() => setActiveTab("seats")}
          style={{
            flex: 1,
            border: "none",
            borderRadius: 0,
            padding: "0.75rem",
            fontSize: 14,
            fontWeight: activeTab === "seats" ? 500 : 400,
            background: activeTab === "seats" ? "#f5f4f2" : "#ffffff",
            color: activeTab === "seats" ? "#1c1917" : "#a8a29e",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            cursor: "pointer",
          }}
        >
          <Armchair size={16} aria-hidden="true" />
          空席状況
        </button>
        <button
          onClick={() => setActiveTab("temp")}
          style={{
            flex: 1,
            border: "none",
            borderRadius: 0,
            padding: "0.75rem",
            fontSize: 14,
            fontWeight: activeTab === "temp" ? 500 : 400,
            background: activeTab === "temp" ? "#f5f4f2" : "#ffffff",
            color: activeTab === "temp" ? "#1c1917" : "#a8a29e",
            borderLeft: "0.5px solid #e7e5e4",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            cursor: "pointer",
          }}
        >
          <Thermometer size={16} aria-hidden="true" />
          温度記録
        </button>
      </div>
    </div>
  );
}
