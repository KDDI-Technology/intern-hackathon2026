import { useState, useEffect, useMemo, useRef } from "react";
import { createRealtimeChannel } from "../realtime";

const POOL = [
  { id: 1, name: "佐藤 美咲", dept: "開発部" },
  { id: 2, name: "田中 健一", dept: "人事部" },
  { id: 3, name: "鈴木 陽子", dept: "開発部" },
  { id: 4, name: "高橋 大輔", dept: "経理部" },
  { id: 5, name: "伊藤 さくら", dept: "広報部" },
  { id: 6, name: "渡辺 翔", dept: "営業部" },
  { id: 7, name: "中村 由美", dept: "法務部" },
  { id: 8, name: "小林 拓也", dept: "開発部" },
];

const ALL = [{ id: 0, name: "山田 太郎", dept: "営業部" }, ...POOL];

const TTL = 900; // 待機の有効期限（秒）
const SPOT = "3F 入り口付近の自販機";
const CHANNEL = "ogori";

const C = {
  page: "#E4E7EA",
  chassis: "#18212F",
  chassisSoft: "#232F44",
  line: "#33415A",
  led: "#F5A524",
  lamp: "#2ECC71",
  lampOff: "#4A5A73",
  red: "#E5544B",
  paper: "#FBFBFA",
  ink: "#141A24",
  mute: "#8C9BB2",
  paperMute: "#6E7887",
};

const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

const SEED = [
  { name: "田中 健一", dept: "人事部", ago: "3日前", result: "joined", waited: 240, cross: true },
  { name: "渡辺 翔", dept: "営業部", ago: "8日前", result: "noshow", waited: 620, cross: false },
  { name: "佐藤 美咲", dept: "開発部", ago: "12日前", result: "joined", waited: 95, cross: true },
];

const mmss = (s) => {
  const v = Math.max(0, Math.ceil(s));
  return String(Math.floor(v / 60)).padStart(2, "0") + ":" + String(v % 60).padStart(2, "0");
};

const median = (arr) => {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export default function OgoriPair() {
  const [meId, setMeId] = useState(0);
  const me = ALL.find((u) => u.id === meId);

  const [tab, setTab] = useState("wait");
  const [status, setStatus] = useState("idle"); // idle | waiting | matched | expired | used
  const [joinedAt, setJoinedAt] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [peers, setPeers] = useState({}); // 他端末の生存情報
  const [match, setMatch] = useState(null);
  const [history, setHistory] = useState(SEED);
  const [pushes, setPushes] = useState(4);
  const [toast, setToast] = useState("");

  const chRef = useRef(null);
  const s = useRef({});
  s.current = { meId, me, status, joinedAt, match, history };

  const flash = (m) => {
    setToast(m);
    setTimeout(() => setToast(""), 3200);
  };

  // ── タブ間チャネル ────────────────────────────────
  useEffect(() => {
    const ch = createRealtimeChannel(CHANNEL);
    chRef.current = ch;

    ch.onmessage = (e) => {
      const m = e.data;
      const cur = s.current;
      if (m.from === cur.meId) return;

      if (m.t === "hb") {
        setPeers((p) => ({
          ...p,
          [m.from]: { user: m.user, waiting: m.waiting, joinedAt: m.joinedAt, seen: Date.now() },
        }));
        return;
      }

      if (m.t === "match") {
        setPeers((p) => {
          const n = { ...p };
          delete n[m.a];
          delete n[m.b];
          return n;
        });
        if ((m.a === cur.meId || m.b === cur.meId) && cur.status === "waiting") {
          const otherId = m.a === cur.meId ? m.b : m.a;
          const other = ALL.find((u) => u.id === otherId);
          setMatch({
            emp: other,
            cross: other.dept !== cur.me.dept,
            first: !cur.history.some((h) => h.name === other.name),
            waited: Math.round((Date.now() - cur.joinedAt) / 1000),
            live: true,
          });
          setStatus("matched");
        }
        return;
      }

      if ((m.t === "done" || m.t === "cancel") && (m.a === cur.meId || m.b === cur.meId)) {
        if (cur.status !== "matched" || !cur.match) return;
        const partner = cur.match.emp;
        setHistory((h) => [
          {
            name: partner.name,
            dept: partner.dept,
            ago: "たった今",
            result: m.t === "done" ? "joined" : "noshow",
            waited: cur.match.waited,
            cross: cur.match.cross,
          },
          ...h,
        ]);
        setMatch(null);
        if (m.t === "done") {
          setStatus("used");
          flash(partner.name + "さんが合流を記録しました");
        } else {
          setStatus("idle");
          flash(partner.name + "さんは行けなくなりました");
        }
      }
    };

    return () => ch.close();
  }, []);

  // ── 生存通知 ──────────────────────────────────────
  useEffect(() => {
    const send = () =>
      chRef.current?.postMessage({
        t: "hb",
        from: meId,
        user: me,
        waiting: status === "waiting",
        joinedAt,
      });
    send();
    const t = setInterval(send, 1500);
    return () => clearInterval(t);
  }, [meId, me, status, joinedAt]);

  // ── 時計と、応答のないタブの掃除 ──────────────────
  useEffect(() => {
    const t = setInterval(() => {
      setNow(Date.now());
      setPeers((p) => {
        const n = {};
        let changed = false;
        for (const k in p) {
          if (Date.now() - p[k].seen < 5000) n[k] = p[k];
          else changed = true;
        }
        return changed ? n : p;
      });
    }, 500);
    return () => clearInterval(t);
  }, []);

  const livePeers = Object.values(peers);
  const soloMode = livePeers.length === 0;
  const waitingPeers = Object.entries(peers).filter(([, p]) => p.waiting);

  // ── マッチ確定（先に待っていた側が確定させる） ────
  useEffect(() => {
    if (status !== "waiting" || waitingPeers.length === 0) return;
    const iAmFirst = waitingPeers.every(
      ([id, p]) => joinedAt < p.joinedAt || (joinedAt === p.joinedAt && meId < Number(id))
    );
    if (!iAmFirst) return;

    const best = waitingPeers
      .map(([id, p]) => {
        const cross = p.user.dept !== me.dept;
        const first = !history.some((h) => h.name === p.user.name);
        return { id: Number(id), user: p.user, cross, first, score: (cross ? 3 : 0) + (first ? 2 : 0) };
      })
      .sort((a, b) => b.score - a.score)[0];

    const t = setTimeout(() => {
      chRef.current?.postMessage({ t: "match", from: meId, a: meId, b: best.id });
      setMatch({
        emp: best.user,
        cross: best.cross,
        first: best.first,
        waited: Math.round((Date.now() - joinedAt) / 1000),
        live: true,
      });
      setStatus("matched");
      setPeers((p) => {
        const n = { ...p };
        delete n[best.id];
        return n;
      });
    }, 700);
    return () => clearTimeout(t);
  }, [peers, status, joinedAt, meId, me, history]);

  // ── 有効期限切れ ──────────────────────────────────
  useEffect(() => {
    if (status !== "waiting" || !joinedAt) return;
    if ((now - joinedAt) / 1000 >= TTL) setStatus("expired");
  }, [now, joinedAt, status]);

  const join = () => {
    setJoinedAt(Date.now());
    setPushes((p) => p + 1);
    setStatus("waiting");
  };

  const record = (result) => {
    if (match.live) {
      chRef.current?.postMessage({
        t: result === "joined" ? "done" : "cancel",
        from: meId,
        a: meId,
        b: match.emp.id,
      });
    }
    setHistory((h) => [
      { name: match.emp.name, dept: match.emp.dept, ago: "たった今", result, waited: match.waited, cross: match.cross },
      ...h,
    ]);
    if (result === "joined") {
      setStatus("used");
      flash("合流を記録しました");
    } else {
      setStatus("idle");
      flash(match.emp.name + "さんは待機列に戻りました");
    }
    setMatch(null);
  };

  const switchUser = (id) => {
    setMeId(id);
    setStatus("idle");
    setMatch(null);
    setJoinedAt(null);
    setPeers({});
    setHistory(SEED.filter((h) => h.name !== ALL.find((u) => u.id === id).name));
    setPushes(4);
  };

  const remain = joinedAt ? TTL - (now - joinedAt) / 1000 : TTL;
  const waitingCount = (status === "waiting" ? 1 : 0) + waitingPeers.length;

  const stats = useMemo(() => {
    const matched = history.length;
    const joinedN = history.filter((h) => h.result === "joined").length;
    const crossN = history.filter((h) => h.cross).length;
    const unmet = ALL.filter((p) => p.id !== meId && !history.some((h) => h.name === p.name)).length;
    return {
      pushes,
      matched,
      medWait: median(history.map((h) => h.waited)),
      matchRate: pushes ? Math.round((matched / pushes) * 100) : 0,
      showRate: matched ? Math.round((joinedN / matched) * 100) : 0,
      crossRate: matched ? Math.round((crossN / matched) * 100) : 0,
      unmet,
    };
  }, [history, pushes, meId]);

  return (
    <div className="ogori-root" style={{ background: C.page, color: C.ink, borderRadius: 20, padding: "20px 16px" }}>
      <div style={{ maxWidth: 440, margin: "0 auto" }}>
        <div className="flex items-end justify-between mb-4">
          <div>
            <div style={{ fontSize: 11, letterSpacing: "0.18em", color: C.paperMute }}>SHACHO NO OGORI</div>
            <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-0.01em" }}>おごりペア</div>
          </div>
          <div className="text-right">
            <div style={{ fontSize: 11, color: C.paperMute, marginBottom: 3 }}>このタブの利用者</div>
            <select
              value={meId}
              onChange={(e) => switchUser(Number(e.target.value))}
              className="rounded-lg px-2 py-1"
              style={{ fontSize: 13, fontWeight: 600, background: C.paper, border: "1px solid #C6CBD1", color: C.ink }}
            >
              {ALL.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}（{u.dept}）
                </option>
              ))}
            </select>
          </div>
        </div>

        <div
          className="flex items-center gap-2 mb-4 px-3 py-2 rounded-lg"
          style={{ background: soloMode ? "#DDE1E6" : "#D6EFE0", fontSize: 12, color: soloMode ? C.paperMute : "#186B45" }}
        >
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: 999,
              background: soloMode ? "#9AA3AD" : "#1FA85C",
              display: "inline-block",
            }}
          />
          {soloMode
            ? "ほかの利用者の接続を待っています"
            : "他の端末 " + livePeers.length + "件と接続中 — リアルタイムでマッチできます"}
        </div>

        <div className="flex gap-1 p-1 mb-4 rounded-xl" style={{ background: "#D5D9DE" }}>
          <OgoriTab tab={tab} id="wait" label="待機" onSelect={setTab} />
          <OgoriTab tab={tab} id="hist" label="履歴" onSelect={setTab} />
          <OgoriTab tab={tab} id="stat" label="計測" onSelect={setTab} />
        </div>

        {tab === "wait" && (
          <div className="rounded-2xl overflow-hidden" style={{ background: C.chassis }}>
            <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: "1px solid " + C.line }}>
              <div className="flex items-center gap-2">
                <span
                  className={status === "waiting" ? "ogori-pulse" : ""}
                  style={{
                    width: 9,
                    height: 9,
                    borderRadius: 999,
                    display: "inline-block",
                    background: status === "waiting" ? C.lamp : status === "matched" ? C.led : C.lampOff,
                  }}
                />
                <span style={{ fontSize: 12, letterSpacing: "0.1em", color: C.mute }}>
                  {status === "waiting" ? "待機中" : status === "matched" ? "マッチ成立" : "停止中"}
                </span>
              </div>
              <span style={{ fontSize: 12, color: C.mute, fontFamily: MONO }}>いま {waitingCount} 人が待機</span>
            </div>

            <div className="px-6 py-8">
              {status === "idle" && (
                <div className="flex flex-col items-center">
                  <button
                    onClick={join}
                    className="ogori-btn rounded-full flex items-center justify-center transition-transform"
                    style={{
                      width: 176,
                      height: 176,
                      background: C.chassisSoft,
                      border: "2px solid " + C.lamp,
                      color: C.paper,
                      fontSize: 19,
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    いま行ける
                  </button>
                  <p className="mt-6 text-center" style={{ fontSize: 13, color: C.mute, lineHeight: 1.7 }}>
                    押すと15分間だけ待機列に入ります。
                    <br />
                    相手が見つかったら通知します。
                  </p>
                </div>
              )}

              {status === "waiting" && (
                <div className="flex flex-col items-center">
                  <div style={{ fontSize: 12, letterSpacing: "0.16em", color: C.mute }}>のこり</div>
                  <div
                    style={{
                      fontFamily: MONO,
                      fontSize: 60,
                      fontWeight: 700,
                      color: C.led,
                      letterSpacing: "0.04em",
                      fontVariantNumeric: "tabular-nums",
                      lineHeight: 1.15,
                    }}
                  >
                    {mmss(remain)}
                  </div>
                  <p className="mt-3 text-center" style={{ fontSize: 13, color: C.mute, lineHeight: 1.7 }}>
                    相手を探しています。
                    <br />
                    画面は閉じても大丈夫です。
                  </p>
                  <button
                    onClick={() => setStatus("idle")}
                    className="ogori-btn mt-6 px-5 py-2 rounded-lg"
                    style={{ background: "transparent", border: "1px solid " + C.line, color: C.mute, fontSize: 13, cursor: "pointer" }}
                  >
                    待機をやめる
                  </button>
                </div>
              )}

              {status === "matched" && match && (
                <div className="ogori-drop">
                  <div className="rounded-xl p-5" style={{ background: C.paper }}>
                    <div className="flex items-center gap-4">
                      <div
                        className="flex items-center justify-center rounded-full shrink-0"
                        style={{ width: 56, height: 56, background: C.chassis, color: C.paper, fontSize: 20, fontWeight: 700 }}
                      >
                        {match.emp.name.slice(0, 1)}
                      </div>
                      <div>
                        <div style={{ fontSize: 19, fontWeight: 700 }}>{match.emp.name}</div>
                        <div style={{ fontSize: 13, color: C.paperMute }}>{match.emp.dept}</div>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 mt-4">
                      {match.cross && <Badge>部署ちがい</Badge>}
                      {match.first && <Badge>はじめまして</Badge>}
                      <Badge>待ち {mmss(match.waited)}</Badge>
                      {match.live && <Badge>別端末の相手</Badge>}
                    </div>
                    <div className="mt-4 pt-4" style={{ borderTop: "1px solid #E4E4E1" }}>
                      <div style={{ fontSize: 12, color: C.paperMute }}>集合場所</div>
                      <div style={{ fontSize: 15, fontWeight: 600, marginTop: 2 }}>{SPOT}</div>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-4">
                    <button
                      onClick={() => record("joined")}
                      className="ogori-btn flex-1 py-3 rounded-xl"
                      style={{ background: C.lamp, color: "#08301C", fontSize: 15, fontWeight: 700, border: "none", cursor: "pointer" }}
                    >
                      合流した
                    </button>
                    <button
                      onClick={() => record("noshow")}
                      className="ogori-btn px-4 py-3 rounded-xl"
                      style={{ background: "transparent", border: "1px solid " + C.line, color: C.mute, fontSize: 14, cursor: "pointer" }}
                    >
                      行けなくなった
                    </button>
                  </div>
                </div>
              )}

              {status === "expired" && (
                <div className="text-center">
                  <div style={{ fontSize: 15, fontWeight: 600, color: C.paper }}>相手が見つかりませんでした</div>
                  <p className="mt-2" style={{ fontSize: 13, color: C.mute, lineHeight: 1.7 }}>
                    15分のあいだ、ほかに待機した人がいませんでした。
                    <br />
                    お昼どきや15時台は人が集まりやすいです。
                  </p>
                  <button
                    onClick={join}
                    className="ogori-btn mt-6 px-6 py-3 rounded-xl"
                    style={{ background: C.chassisSoft, border: "1px solid " + C.lamp, color: C.paper, fontSize: 15, fontWeight: 600, cursor: "pointer" }}
                  >
                    もう一度待つ
                  </button>
                </div>
              )}

              {status === "used" && (
                <div className="text-center">
                  <div style={{ fontSize: 15, fontWeight: 600, color: C.paper }}>今日のぶんは使いました</div>
                  <p className="mt-2" style={{ fontSize: 13, color: C.mute, lineHeight: 1.7 }}>
                    おごりは1日1回までです。
                    <br />
                    また明日どうぞ。
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {tab === "hist" && (
          <div className="rounded-2xl p-5" style={{ background: C.paper }}>
            <div className="flex items-baseline justify-between mb-4">
              <div style={{ fontSize: 15, fontWeight: 700 }}>これまでのペア</div>
              <div style={{ fontSize: 12, color: C.paperMute }}>まだ会っていない人 {stats.unmet}人</div>
            </div>
            {history.length === 0 ? (
              <p style={{ fontSize: 13, color: C.paperMute }}>まだ記録がありません。待機タブから始めてください。</p>
            ) : (
              <div className="flex flex-col">
                {history.map((h, i) => (
                  <div key={i} className="flex items-center gap-3 py-3" style={{ borderTop: i === 0 ? "none" : "1px solid #EAEAE6" }}>
                    <div
                      className="flex items-center justify-center rounded-full shrink-0"
                      style={{ width: 38, height: 38, background: "#EDEDE9", fontSize: 15, fontWeight: 700 }}
                    >
                      {h.name.slice(0, 1)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div style={{ fontSize: 14, fontWeight: 600 }}>{h.name}</div>
                      <div style={{ fontSize: 12, color: C.paperMute }}>
                        {h.dept} · {h.ago}
                      </div>
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: h.result === "joined" ? "#1B7F4D" : C.red }}>
                      {h.result === "joined" ? "合流" : "不成立"}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "stat" && (
          <div className="rounded-2xl p-5" style={{ background: C.paper }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>PoCで見たい数字</div>
            <p className="mt-1 mb-4" style={{ fontSize: 12, color: C.paperMute, lineHeight: 1.6 }}>
              通知チャネルを変えても、ここの数字は変わりません。方式そのものが機能するかの判断材料です。
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Metric label="待機ボタン押下" value={stats.pushes} unit="回" />
              <Metric label="マッチ成立率" value={stats.matchRate} unit="%" />
              <Metric label="待機時間の中央値" value={mmss(stats.medWait)} mono />
              <Metric label="合流率" value={stats.showRate} unit="%" alert={stats.showRate < 70} />
              <Metric label="部署をまたいだ割合" value={stats.crossRate} unit="%" />
              <Metric label="未接触の社員" value={stats.unmet} unit="人" />
            </div>
            <p className="mt-4" style={{ fontSize: 12, color: C.paperMute, lineHeight: 1.7 }}>
              待機の有効期限が15分なら1日あたり32枠。押下数が30回を下回ると、ほとんどマッチしません。
            </p>
          </div>
        )}

        <div className="mt-5 rounded-xl p-4" style={{ border: "1px dashed #AFB6BE" }}>
          <div style={{ fontSize: 11, letterSpacing: "0.14em", color: C.paperMute, marginBottom: 10 }}>
            デモ操作（本番にはありません）
          </div>
          <div className="flex flex-wrap gap-2">
            <Demo
              onClick={() => {
                if (status === "waiting") setStatus("expired");
                else flash("待機中のときに使えます");
              }}
            >
              15分経過させる
            </Demo>
            <Demo
              onClick={() => {
                setStatus("idle");
                setMatch(null);
                setJoinedAt(null);
                setHistory(SEED.filter((h) => h.name !== me.name));
                setPushes(4);
                flash("このタブを初期状態に戻しました");
              }}
            >
              リセット
            </Demo>
          </div>
          <p className="mt-3" style={{ fontSize: 12, color: C.paperMute, lineHeight: 1.6 }}>
            別のPCやスマホで同じURLを開き、利用者を別の人に切り替えると、両方で「いま行ける」を押したときにリアルタイムでマッチします。
          </p>
        </div>

        {toast && (
          <div className="mt-4 px-4 py-3 rounded-lg" style={{ background: C.chassis, color: C.paper, fontSize: 13 }}>
            {toast}
          </div>
        )}
      </div>
    </div>
  );
}

function OgoriTab({ tab, id, label, onSelect }) {
  return (
    <button
      onClick={() => onSelect(id)}
      className="flex-1 py-2 text-sm rounded-lg transition-colors"
      style={{
        background: tab === id ? C.chassis : "transparent",
        color: tab === id ? C.paper : C.paperMute,
        fontWeight: tab === id ? 600 : 400,
        border: "none",
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}

function Badge({ children }) {
  return (
    <span className="px-2 py-1 rounded" style={{ background: "#EDEDE9", fontSize: 11, fontWeight: 600, color: "#3F4650" }}>
      {children}
    </span>
  );
}

function Demo({ children, onClick }) {
  return (
    <button
      onClick={onClick}
      className="ogori-btn px-3 py-2 rounded-lg transition-colors"
      style={{ background: "#D9DDE2", color: "#3F4650", fontSize: 12, fontWeight: 600, border: "none", cursor: "pointer" }}
    >
      {children}
    </button>
  );
}

function Metric({ label, value, unit, mono, alert }) {
  return (
    <div className="rounded-lg p-3" style={{ background: "#F1F1ED" }}>
      <div style={{ fontSize: 11, color: "#6E7887", lineHeight: 1.4 }}>{label}</div>
      <div
        className="mt-1"
        style={{
          fontSize: 24,
          fontWeight: 700,
          color: alert ? "#C0392B" : "#141A24",
          fontFamily: mono ? MONO : undefined,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
        {unit && <span style={{ fontSize: 13, fontWeight: 600, marginLeft: 2 }}>{unit}</span>}
      </div>
    </div>
  );
}
