import { useState, useEffect, useRef } from "react";
import { createRealtimeChannel } from "../realtime";

const SEAT_STORAGE_KEY = "seatmap:custom-v1";
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
const emptySeats = () => Object.fromEntries(SEAT_IDS.map((id) => [id, false]));

function normalizeSeats(data = {}) {
  return Object.fromEntries(
    SEAT_IDS.map((id) => {
      const seat = data[id];
      if (seat === true) return [id, { occupied: true, surname: "" }];
      return [id, seat && typeof seat === "object" ? seat : false];
    }),
  );
}

function readCachedSeats() {
  try {
    return normalizeSeats(JSON.parse(localStorage.getItem(SEAT_STORAGE_KEY) || "{}"));
  } catch {
    return emptySeats();
  }
}

function cacheSeats(seats) {
  localStorage.setItem(SEAT_STORAGE_KEY, JSON.stringify(seats));
}
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
    return { bg: "var(--temp-none-bg)", text: "var(--temp-none-text)", border: "var(--temp-none-border)" };
  }
  const v = Number(value);
  if (v < 21) return { bg: "var(--temp-cold-bg)", text: "var(--temp-cold-text)", border: "var(--temp-cold-border)" };
  if (v < 26) return { bg: "var(--temp-ok-bg)", text: "var(--temp-ok-text)", border: "var(--temp-ok-border)" };
  return { bg: "var(--temp-hot-bg)", text: "var(--temp-hot-text)", border: "var(--temp-hot-border)" };
}

function SeatsView({ currentUser }) {
  const surname = currentUser?.name?.trim().split(/[\s　]+/)[0] || "利用者";
  const [seats, setSeats] = useState(readCachedSeats);
  const [loaded] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedSeat, setSelectedSeat] = useState(null);
  const channelRef = useRef(null);

  useEffect(() => {
    const realtime = createRealtimeChannel("seats");
    channelRef.current = realtime;
    realtime.onmessage = ({ data }) => {
      if (data.t === "snapshot") {
        if (!data.initialized) {
          realtime.postMessage({ t: "init", seats: readCachedSeats() });
          return;
        }
        const next = normalizeSeats(data.seats);
        setSeats(next);
        cacheSeats(next);
      } else if (data.t === "set" && SEAT_IDS.includes(data.id)) {
        setSeats((prev) => {
          const next = { ...prev, [data.id]: data.seat || false };
          cacheSeats(next);
          return next;
        });
      }
    };

    const syncFromAnotherTab = (event) => {
      if (event.key === SEAT_STORAGE_KEY && event.newValue) {
        try { setSeats(normalizeSeats(JSON.parse(event.newValue))); } catch { /* 無効な保存値は無視 */ }
      }
    };
    window.addEventListener("storage", syncFromAnotherTab);
    return () => {
      realtime.close();
      channelRef.current = null;
      window.removeEventListener("storage", syncFromAnotherTab);
    };
  }, []);

  const persist = (nextSeats, payload) => {
    setSaving(true);
    cacheSeats(nextSeats);
    channelRef.current?.postMessage(payload);
    window.setTimeout(() => setSaving(false), 250);
  };

  const selectSeat = (id) => setSelectedSeat(id);

  const setStatus = (isOccupied) => {
    if (!selectedSeat) return;
    setSeats((prev) => {
      const next = {
        ...prev,
        [selectedSeat]: isOccupied
          ? {
              occupied: true,
              surname,
              name: currentUser?.name || surname,
              email: currentUser?.email || "",
            }
          : false,
      };
      persist(next, { t: "set", id: selectedSeat, seat: next[selectedSeat] });
      return next;
    });
    setSelectedSeat(null);
  };

  const clearAll = () => {
    const next = {};
    SEAT_IDS.forEach((id) => (next[id] = false));
    setSeats(next);
    setSelectedSeat(null);
    persist(next, { t: "replace", seats: next });
  };

  const total = SEAT_IDS.length;
  const occupiedCount = Object.values(seats).filter(Boolean).length;
  const availableCount = total - occupiedCount;

  if (!loaded) {
    return <div style={{ padding: "2rem 0", color: "var(--seat-text)", fontSize: 14 }}>読み込み中…</div>;
  }

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
          <div style={{ background: "var(--seat-panel)", borderRadius: "8px", padding: "0.5rem 0.875rem", minWidth: 76, textAlign: "center" }}>
            <p style={{ fontSize: 12, color: "var(--seat-text)", margin: 0 }}>空席</p>
            <p style={{ fontSize: 20, fontWeight: 500, margin: 0 }}>{availableCount}</p>
          </div>
          <div style={{ background: "var(--seat-panel)", borderRadius: "8px", padding: "0.5rem 0.875rem", minWidth: 76, textAlign: "center" }}>
            <p style={{ fontSize: 12, color: "var(--seat-text)", margin: 0 }}>着席</p>
            <p style={{ fontSize: 20, fontWeight: 500, margin: 0 }}>{occupiedCount}</p>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {saving && <span style={{ fontSize: 12, color: "var(--seat-subtle)" }}>保存中…</span>}
          <button onClick={clearAll} style={{ fontSize: 13 }}>
            <i className="ti ti-refresh" aria-hidden="true" style={{ fontSize: 16, verticalAlign: -3, marginRight: 4 }}></i>
            全部空席にする
          </button>
        </div>
      </div>

      {selectedSeat ? (
        <div
          style={{
            background: "var(--seat-panel)",
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
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: "50%",
              background: "var(--seat-cell)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 22,
              fontWeight: 500,
            }}
          >
            {SEAT_IDS.indexOf(selectedSeat) + 1}
          </div>
          <span style={{ fontSize: 14, color: "var(--seat-text)" }}>
            {SEAT_IDS.indexOf(selectedSeat) + 1}番の状態を選択
          </span>
          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={() => setStatus(false)}
              style={{
                fontSize: 14,
                fontWeight: 500,
                color: "var(--seat-text)",
                background: "var(--seat-cell)",
                border: "2px solid var(--seat-subtle)",
                borderRadius: 8,
                padding: "0.6rem 1.1rem",
              }}
            >
              空き
            </button>
            <button
              onClick={() => setStatus(true)}
              style={{
                fontSize: 14,
                fontWeight: 500,
                color: "var(--seat-occupied-text)",
                background: "var(--seat-occupied-bg)",
                border: "2px solid var(--seat-occupied-text)",
                borderRadius: 8,
                padding: "0.6rem 1.1rem",
              }}
            >
              使用中
            </button>
          </div>
          <button
            onClick={() => setSelectedSeat(null)}
            aria-label="キャンセル"
            style={{
              fontSize: 13,
              fontWeight: 500,
              color: "var(--seat-text)",
              background: "var(--seat-cell)",
              border: "2px solid var(--seat-line)",
              borderRadius: 8,
              padding: "0.5rem 1rem",
            }}
          >
            キャンセル
          </button>
        </div>
      ) : (
        <div
          style={{
            background: "var(--seat-panel)",
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
              color: "var(--seat-text)",
              borderBottom: "0.5px solid var(--seat-line-soft)",
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
                  <div key={`aisle-${blockIdx}`} style={{ textAlign: "center", fontSize: 17, fontWeight: 500, color: "var(--seat-text)", padding: "2px 0" }}>
                    通路
                  </div>
                );
              }
              const currentRow = rowIndex;
              rowIndex++;
              return (
                <div
                  key={`row-${blockIdx}`}
                  style={{
                    display: "flex",
                    justifyContent: "center",
                    border: "0.5px solid var(--seat-line)",
                    borderRadius: 8,
                    overflow: "hidden",
                    width: "fit-content",
                    margin: "0 auto",
                  }}
                >
                  {Array.from({ length: block.count }).map((_, seatIdx) => {
                    const id = `r${currentRow}-${seatIdx}`;
                    const isOccupied = !!seats[id];
                    const occupantSurname = typeof seats[id] === "object" ? seats[id].surname : "";
                    const seatNumber = SEAT_IDS.indexOf(id) + 1;
                    const isSelected = selectedSeat === id;
                    return (
                      <button
                        key={id}
                        onClick={() => selectSeat(id)}
                        aria-label={`${seatNumber}番 ${isOccupied ? "着席中" : "空席"}`}
                        aria-pressed={isOccupied}
                        style={{
                          width: 56,
                          height: 56,
                          padding: 0,
                          borderRadius: 0,
                          border: isSelected ? "2px solid var(--seat-select)" : "none",
                          borderRight:
                            !isSelected && seatIdx < block.count - 1
                              ? "0.5px solid var(--seat-line)"
                              : isSelected
                              ? "2px solid var(--seat-select)"
                              : "none",
                          background: isOccupied ? "var(--seat-occupied-bg)" : "var(--seat-cell)",
                          color: isOccupied ? "var(--seat-occupied-text)" : "var(--seat-text)",
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          justifyContent: "center",
                          cursor: "pointer",
                          transition: "transform 0.1s",
                          position: "relative",
                          zIndex: isSelected ? 1 : 0,
                        }}
                        onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.92)")}
                        onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
                        onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
                      >
                        <span style={{ fontSize: 17, fontWeight: 500, color: isOccupied ? "var(--seat-occupied-text)" : "var(--seat-text)" }}>
                          {seatNumber}
                        </span>
                        {isOccupied ? (
                          <span style={{ fontSize: 10, fontWeight: 700, lineHeight: 1.1, color: "var(--seat-occupied-text)" }}>
                            {occupantSurname || "使用中"}
                          </span>
                        ) : (
                          <i className="ti ti-armchair-2" aria-hidden="true" style={{ fontSize: 15, color: "var(--seat-text)" }}></i>
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <p style={{ fontSize: 12, color: "var(--seat-subtle)", marginTop: 12, textAlign: "center" }}>
        席をタップして、空席と着席を切り替えられます。
      </p>
    </div>
  );
}

function TemperatureView({ currentUser }) {
  const [temps, setTemps] = useState(DEFAULT_TEMPS);
  const [seatAssignments, setSeatAssignments] = useState({});
  const [loaded, setLoaded] = useState(false);
  const currentSurname = currentUser?.name?.trim().split(/[\s　]+/)[0] || "";

  useEffect(() => {
    (async () => {
      try {
        const tempResult = await window.storage.get(TEMP_STORAGE_KEY, false);
        const stored = tempResult && tempResult.value ? JSON.parse(tempResult.value) : {};
        const merged = { ...stored, ...DEFAULT_TEMPS };
        setTemps(merged);
        setSeatAssignments(readCachedSeats());
        await window.storage.set(TEMP_STORAGE_KEY, JSON.stringify(merged), false);
      } catch (e) {
        // 保存データなし
        setTemps(DEFAULT_TEMPS);
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  if (!loaded) {
    return <div style={{ padding: "2rem 0", color: "var(--seat-text)", fontSize: 14 }}>読み込み中…</div>;
  }

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
          color: "var(--seat-text)",
        }}
      >
        <span>
          <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, background: "var(--temp-cold-bg)", border: "1px solid var(--temp-cold-border)", marginRight: 4, verticalAlign: -1 }}></span>
          21°C未満
        </span>
        <span>
          <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, background: "var(--temp-ok-bg)", border: "1px solid var(--temp-ok-border)", marginRight: 4, verticalAlign: -1 }}></span>
          21〜25.9°C
        </span>
        <span>
          <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, background: "var(--temp-hot-bg)", border: "1px solid var(--temp-hot-border)", marginRight: 4, verticalAlign: -1 }}></span>
          26°C以上
        </span>
      </div>

      <div
        style={{
          background: "var(--seat-panel)",
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
            color: "var(--seat-text)",
            borderBottom: "0.5px solid var(--seat-line-soft)",
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
                <div key={`aisle-${blockIdx}`} style={{ textAlign: "center", fontSize: 17, fontWeight: 500, color: "var(--seat-text)", padding: "2px 0" }}>
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
                  const isMySeat = [seatAssignments[idA], seatAssignments[idB]].some((seat) => {
                    if (!seat || typeof seat !== "object") return false;
                    if (currentUser?.email && seat.email) {
                      return seat.email === currentUser.email;
                    }
                    return Boolean(currentSurname && seat.surname === currentSurname);
                  });
                  return (
                    <div
                      key={groupIdx}
                      aria-label={`${seatNumberA}・${seatNumberB}番 ${value !== undefined ? value + "度" : "未記録"}${isMySeat ? " あなたの席" : ""}`}
                      style={{
                        width: 112,
                        height: 56,
                        borderRadius: 8,
                        border: isMySeat ? "3px solid var(--temp-mine)" : "0.5px solid var(--seat-line)",
                        boxShadow: isMySeat ? "var(--temp-mine-ring)" : "none",
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

      <p style={{ fontSize: 12, color: "var(--seat-subtle)", marginTop: 12, textAlign: "center" }}>
        温度は自動で記録されたものを表示しています(閲覧専用)。
      </p>
    </div>
  );
}

export default function SeatAndTemperatureApp({ currentUser }) {
  const [activeTab, setActiveTab] = useState("seats");

  return (
    <div style={{ padding: "0.5rem 1.5rem" }}>
      <div
        style={{
          position: "sticky",
          top: 0,
          left: 0,
          right: 0,
          display: "flex",
          background: "var(--seat-tabbar)",
          border: "0.5px solid var(--seat-line-soft)",
          borderRadius: 12,
          overflow: "hidden",
          marginBottom: "1.5rem",
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
            background: activeTab === "seats" ? "var(--seat-tab-active)" : "var(--seat-tabbar)",
            color: activeTab === "seats" ? "var(--seat-strong)" : "var(--seat-subtle)",
          }}
        >
          <i className="ti ti-armchair-2" aria-hidden="true" style={{ fontSize: 16, verticalAlign: -3, marginRight: 6 }}></i>
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
            background: activeTab === "temp" ? "var(--seat-tab-active)" : "var(--seat-tabbar)",
            color: activeTab === "temp" ? "var(--seat-strong)" : "var(--seat-subtle)",
            borderLeft: "0.5px solid var(--seat-line-soft)",
          }}
        >
          <i className="ti ti-temperature" aria-hidden="true" style={{ fontSize: 16, verticalAlign: -3, marginRight: 6 }}></i>
          温度記録
        </button>
      </div>

      {activeTab === "seats" ? <SeatsView currentUser={currentUser} /> : <TemperatureView currentUser={currentUser} />}
    </div>
  );
}
