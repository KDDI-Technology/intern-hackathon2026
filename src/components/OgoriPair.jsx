import React, { useState, useEffect, useMemo, useRef } from "react";

/* ============================================================
   おごりペア PoC v2
   KPT評価を受けた改善版（src/components/OgoriPair.jsx）

   Keep  : 使いやすさ / 計測タブの「部署を跨いだ割合」→ そのまま維持
   Problem 対応
     - 「いま行ける」の視認性 → 塗りつぶし＋リング＋サイズ拡大
     - 本人確認がない        → START画面で利用者を確定（自己申告だが固定）
     - マッチング後の対応    → 集合カウントダウン／向かっています／双方確認
     - マッチング時間の変更  → 待機時間を選択、待機中に延長
   Try 対応
     - START画面（オプトイン同意つき）
     - 通知機能（ブラウザ通知・許可制／画面内バナー）
     - マッチングに優先順位（理由を画面に表示）
   見送り（この層では解けない）
     - ログイン、Teamsプラグイン、UWB、ランチ版 → サーバ／別実装が必要
   ============================================================ */

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

const TTL_CHOICES = [
  { v: 600, label: "10分" },
  { v: 900, label: "15分" },
  { v: 1800, label: "30分" },
  { v: 3600, label: "60分" },
];
const EXTEND = 600; // 待機中に延長できる秒数
const MEET_LIMIT = 420; // マッチ後、集合までの目安（秒）
const SPOT = "3F 入り口付近の自販機";
const CHANNEL = "ogori-pair";

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
  { name: "中村 由美", dept: "法務部", ago: "10日前", result: "unconfirmed", waited: 310, cross: true },
  { name: "佐藤 美咲", dept: "開発部", ago: "12日前", result: "joined", waited: 95, cross: true },
];

const RESULT_LABEL = { joined: "合流", unconfirmed: "未確認", noshow: "不成立" };
const RESULT_COLOR = { joined: "#1B7F4D", unconfirmed: "#A66A00", noshow: C.red };

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

export default function OgoriPair({ currentUser }) {
  const normalizedLoginName = currentUser?.name?.replace(/[\s　]/g, "");
  const me = ALL.find((u) => u.name.replace(/[\s　]/g, "") === normalizedLoginName) || {
    id: 1000,
    name: currentUser?.name || "ゲスト",
    dept: "所属未設定",
  };
  const meId = me.id;

  const [status, setStatus] = useState("start"); // start | idle | waiting | matched | expired | used
  const [agreed, setAgreed] = useState(false);
  const [tab, setTab] = useState("wait");

  const [ttl, setTtl] = useState(900);
  const [extra, setExtra] = useState(0);
  const [joinedAt, setJoinedAt] = useState(null);
  const [now, setNow] = useState(Date.now());

  const [peers, setPeers] = useState({});
  const [match, setMatch] = useState(null);
  const [meetAt, setMeetAt] = useState(null);
  const [iConfirmed, setIConfirmed] = useState(false);
  const [peerConfirmed, setPeerConfirmed] = useState(false);
  const [peerHeading, setPeerHeading] = useState(false);
  const [iHeading, setIHeading] = useState(false);

  const [history, setHistory] = useState(SEED);
  const [pushes, setPushes] = useState(4);
  const [toast, setToast] = useState("");
  const [notifyPerm, setNotifyPerm] = useState("unsupported");

  const chRef = useRef(null);
  const s = useRef({});
  s.current = { meId, me, status, joinedAt, match, history, iConfirmed };

  const flash = (m) => {
    setToast(m);
    setTimeout(() => setToast(""), 3600);
  };

  // ── 通知 ──────────────────────────────────────────
  useEffect(() => {
    try {
      if (typeof Notification !== "undefined") setNotifyPerm(Notification.permission);
    } catch (e) {
      setNotifyPerm("unsupported");
    }
  }, []);

  const askNotify = async () => {
    try {
      if (typeof Notification === "undefined") return;
      const p = await Notification.requestPermission();
      setNotifyPerm(p);
      if (p === "granted") flash("画面を閉じていても、相手が見つかったら知らせます");
    } catch (e) {
      setNotifyPerm("unsupported");
    }
  };

  const notify = (title, body) => {
    try {
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        new Notification(title, { body, tag: "ogori-pair" });
      }
    } catch (e) {
      /* 通知が使えない環境では画面内バナーだけで伝える */
    }
  };

  // ── タブ間チャネル ────────────────────────────────
  const beginMatch = (m) => {
    setMatch(m);
    setMeetAt(Date.now() + MEET_LIMIT * 1000);
    setIConfirmed(false);
    setPeerConfirmed(false);
    setPeerHeading(false);
    setIHeading(false);
    setStatus("matched");
    setTab("wait");
    notify("相手が見つかりました", m.emp.name + "（" + m.emp.dept + "）· " + SPOT);
  };

  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const ch = new BroadcastChannel(CHANNEL);
    chRef.current = ch;

    ch.onmessage = (e) => {
      const m = e.data;
      const cur = s.current;
      if (m.from === cur.meId) return;
      const forMe = m.a === cur.meId || m.b === cur.meId;

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
        if (forMe && cur.status === "waiting") {
          const otherId = m.a === cur.meId ? m.b : m.a;
          const other = ALL.find((u) => u.id === otherId);
          const cross = other.dept !== cur.me.dept;
          const first = !cur.history.some((h) => h.name === other.name);
          beginMatch({
            emp: other,
            cross,
            first,
            waited: Math.round((Date.now() - cur.joinedAt) / 1000),
            live: true,
            reasons: buildReasons(cross, first, Math.round((Date.now() - cur.joinedAt) / 1000)),
          });
        }
        return;
      }

      if (!forMe || cur.status !== "matched" || !cur.match) return;

      if (m.t === "heading") {
        setPeerHeading(true);
        flash(cur.match.emp.name + "さんが自販機に向かっています");
        return;
      }

      if (m.t === "confirm") {
        setPeerConfirmed(true);
        notify("相手が合流を記録しました", cur.match.emp.name + "さん");
        return;
      }

      if (m.t === "cancel") {
        const partner = cur.match.emp;
        setHistory((h) => [
          {
            name: partner.name,
            dept: partner.dept,
            ago: "たった今",
            result: "noshow",
            waited: cur.match.waited,
            cross: cur.match.cross,
          },
          ...h,
        ]);
        clearMatch();
        setStatus("idle");
        flash(partner.name + "さんは行けなくなりました。もう一度待てます。");
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
        const wait = (Date.now() - p.joinedAt) / 1000;
        return {
          id: Number(id),
          user: p.user,
          cross,
          first,
          wait,
          score: (cross ? 3 : 0) + (first ? 2 : 0) + Math.min(wait / ttl, 1),
        };
      })
      .sort((a, b) => b.score - a.score)[0];

    const t = setTimeout(() => {
      chRef.current?.postMessage({ t: "match", from: meId, a: meId, b: best.id });
      const waited = Math.round((Date.now() - joinedAt) / 1000);
      beginMatch({
        emp: best.user,
        cross: best.cross,
        first: best.first,
        waited,
        live: true,
        reasons: buildReasons(best.cross, best.first, Math.round(best.wait)),
      });
      setPeers((p) => {
        const n = { ...p };
        delete n[best.id];
        return n;
      });
    }, 700);
    return () => clearTimeout(t);
  }, [peers, status, joinedAt, meId, me, history, ttl]);

  // ── 他タブがないときだけモック社員を出す ──────────
  useEffect(() => {
    if (status !== "waiting" || !soloMode) return;
    const t = setInterval(() => {
      if (Math.random() > 0.22) return;
      const cands = POOL.filter((p) => p.id !== meId);
      const emp = cands[Math.floor(Math.random() * cands.length)];
      const cross = emp.dept !== me.dept;
      const first = !history.some((h) => h.name === emp.name);
      const waited = Math.round((Date.now() - joinedAt) / 1000);
      beginMatch({ emp, cross, first, waited, live: false, reasons: buildReasons(cross, first, waited) });
    }, 1000);
    return () => clearInterval(t);
  }, [status, soloMode, meId, me, joinedAt, history]);

  // ── モック相手のふるまい（他タブがないとき用） ────
  const matchKey = match ? match.emp.id : null;
  const matchLive = match ? match.live : false;

  useEffect(() => {
    if (status !== "matched" || matchKey === null || matchLive) return;
    const t = setTimeout(() => setPeerHeading(true), 2600 + Math.random() * 2400);
    return () => clearTimeout(t);
  }, [status, matchKey, matchLive]);

  useEffect(() => {
    if (status !== "matched" || matchKey === null || matchLive || !iConfirmed) return;
    const t = setTimeout(() => {
      if (Math.random() < 0.85) setPeerConfirmed(true);
    }, 3500);
    return () => clearTimeout(t);
  }, [status, matchKey, matchLive, iConfirmed]);

  // ── 有効期限切れ ──────────────────────────────────
  useEffect(() => {
    if (status !== "waiting" || !joinedAt) return;
    if ((now - joinedAt) / 1000 >= ttl + extra) {
      setStatus("expired");
      notify("相手が見つかりませんでした", "待機時間が終わりました");
    }
  }, [now, joinedAt, status, ttl, extra]);

  // ── 双方の確認がそろったら成立 ────────────────────
  useEffect(() => {
    if (status !== "matched" || !match) return;
    if (iConfirmed && peerConfirmed) finish("joined");
  }, [iConfirmed, peerConfirmed, status, match]);

  // ── 集合時間を過ぎても片側だけなら未確認で締める ──
  useEffect(() => {
    if (status !== "matched" || !meetAt || !match) return;
    if (now < meetAt) return;
    if (iConfirmed && !peerConfirmed) finish("unconfirmed");
  }, [now, meetAt, status, match, iConfirmed, peerConfirmed]);

  function buildReasons(cross, first, waited) {
    const r = [];
    if (cross) r.push("部署が違うから");
    if (first) r.push("まだ会っていないから");
    if (waited >= 300) r.push("待ち時間が長いから");
    if (!r.length) r.push("同じ時間に待っていたから");
    return r;
  }

  function clearMatch() {
    setMatch(null);
    setMeetAt(null);
    setIConfirmed(false);
    setPeerConfirmed(false);
    setPeerHeading(false);
    setIHeading(false);
  }

  function finish(result) {
    const m = s.current.match;
    if (!m) return;
    setHistory((h) => [
      { name: m.emp.name, dept: m.emp.dept, ago: "たった今", result, waited: m.waited, cross: m.cross },
      ...h,
    ]);
    clearMatch();
    if (result === "joined") {
      setStatus("used");
      flash("双方の確認がそろいました。おごりは自販機の画面に出ます。");
      notify("合流を記録しました", m.emp.name + "さんと合流");
    } else if (result === "unconfirmed") {
      setStatus("used");
      flash("相手の確認が取れなかったため、未確認として記録しました");
    } else {
      setStatus("idle");
    }
  }

  const join = () => {
    setJoinedAt(Date.now());
    setExtra(0);
    setPushes((p) => p + 1);
    setStatus("waiting");
  };

  const confirmJoin = () => {
    if (!match) return;
    if (match.live) {
      chRef.current?.postMessage({ t: "confirm", from: meId, a: meId, b: match.emp.id });
    }
    setIConfirmed(true);
  };

  const sendHeading = () => {
    if (!match) return;
    if (match.live) {
      chRef.current?.postMessage({ t: "heading", from: meId, a: meId, b: match.emp.id });
    }
    setIHeading(true);
    flash("相手の画面に「向かっています」と表示されます");
  };

  const giveUp = () => {
    if (!match) return;
    if (match.live) {
      chRef.current?.postMessage({ t: "cancel", from: meId, a: meId, b: match.emp.id });
    }
    const name = match.emp.name;
    setHistory((h) => [
      { name: match.emp.name, dept: match.emp.dept, ago: "たった今", result: "noshow", waited: match.waited, cross: match.cross },
      ...h,
    ]);
    clearMatch();
    setStatus("idle");
    flash(name + "さんは待機列に戻りました");
  };

  const remain = joinedAt
    ? Math.min(ttl + extra, ttl + extra - (now - joinedAt) / 1000)
    : ttl;
  const meetRemain = meetAt
    ? Math.min(MEET_LIMIT, (meetAt - now) / 1000)
    : 0;
  const meetOver = meetAt ? now >= meetAt : false;
  const waitingCount = (status === "waiting" ? 1 : 0) + waitingPeers.length;
  const ttlMin = Math.round(ttl / 60);

  const stats = useMemo(() => {
    const matched = history.length;
    const joinedN = history.filter((h) => h.result === "joined").length;
    const unconfN = history.filter((h) => h.result === "unconfirmed").length;
    const crossN = history.filter((h) => h.cross).length;
    const unmet = ALL.filter((p) => p.id !== meId && !history.some((h) => h.name === p.name)).length;
    return {
      pushes,
      matched,
      unconfN,
      medWait: median(history.map((h) => h.waited)),
      matchRate: pushes ? Math.round((matched / pushes) * 100) : 0,
      showRate: matched ? Math.round((joinedN / matched) * 100) : 0,
      crossRate: matched ? Math.round((crossN / matched) * 100) : 0,
      unmet,
    };
  }, [history, pushes, meId]);

  const Tab = ({ id, label }) => (
    <button
      onClick={() => setTab(id)}
      className="flex-1 py-2 text-sm rounded-lg transition-colors"
      style={{
        background: tab === id ? C.chassis : "transparent",
        color: tab === id ? C.paper : C.paperMute,
        fontWeight: tab === id ? 600 : 400,
      }}
    >
      {label}
    </button>
  );

  const styleTag = (
    <style>{`
      @media (prefers-reduced-motion: no-preference) {
        @keyframes drop { 0% { transform: translateY(-28px); opacity: 0 } 70% { transform: translateY(4px); opacity: 1 } 100% { transform: translateY(0) } }
        @keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: .35 } }
        @keyframes ring { 0% { transform: scale(1); opacity: .55 } 100% { transform: scale(1.28); opacity: 0 } }
        .drop { animation: drop .45s cubic-bezier(.2,.8,.3,1) both }
        .pulse { animation: pulse 1.6s ease-in-out infinite }
        .ring { animation: ring 2.2s ease-out infinite }
      }
      .btn:focus-visible { outline: 3px solid ${C.led}; outline-offset: 3px }
      .chip:focus-visible { outline: 3px solid ${C.led}; outline-offset: 2px }
    `}</style>
  );

  // ── START画面 ─────────────────────────────────────
  if (status === "start") {
    return (
      <div className="min-h-screen w-full flex justify-center px-4 py-8" style={{ background: C.page, color: C.ink }}>
        {styleTag}
        <div className="w-full" style={{ maxWidth: 440 }}>
          <div style={{ fontSize: 11, letterSpacing: "0.18em", color: C.paperMute }}>SHACHO NO OGORI</div>
          <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: "-0.01em", marginBottom: 6 }}>おごりペア</div>
          <p style={{ fontSize: 14, color: C.paperMute, lineHeight: 1.8, marginBottom: 20 }}>
            自販機の前で、社内の誰かと1杯だけ。
            <br />
            相手は自動で決まります。おごりは1日1回まで。
          </p>

          <div className="rounded-2xl p-5 mb-4" style={{ background: C.paper }}>
            <Step n="1" title="「いま行ける」を押す">
              {ttlMin}分だけ待機列に入ります。押したあとは画面を閉じても大丈夫です。
            </Step>
            <Step n="2" title="相手が決まったら通知が届く">
              集合場所は{SPOT}。7分を目安に向かってください。
            </Step>
            <Step n="3" title="二人とも「合流した」を押す">
              片方だけの申告では成立しません。そろって初めておごりが出ます。
            </Step>
          </div>

          <div className="rounded-2xl p-5 mb-4" style={{ background: C.paper }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>この端末の利用者</div>
            <div className="w-full rounded-lg px-3 py-2" style={{ fontSize: 15, fontWeight: 600, background: "#F1F1ED", border: "1px solid #C6CBD1", color: C.ink }}>
              {me.name}（{me.dept}）
            </div>
            <p className="mt-2" style={{ fontSize: 12, color: C.paperMute, lineHeight: 1.7 }}>
              ログイン中の利用者として固定されています。ここでは変更できません。
            </p>
          </div>

          <div className="rounded-2xl p-5 mb-4" style={{ background: C.paper }}>
            <label className="flex items-start gap-3" style={{ cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                style={{ width: 18, height: 18, marginTop: 2, accentColor: "#1B7F4D" }}
              />
              <span style={{ fontSize: 13, lineHeight: 1.7 }}>
                参加は任意です。マッチの履歴は本人だけが見られ、管理者に渡るのは人数や割合などの集計値だけです。
              </span>
            </label>
            {notifyPerm === "default" && (
              <button
                onClick={askNotify}
                className="btn mt-4 w-full py-2 rounded-lg"
                style={{ background: "#EDEDE9", color: "#3F4650", fontSize: 13, fontWeight: 600 }}
              >
                通知を許可する（相手が見つかったら知らせます）
              </button>
            )}
            {notifyPerm === "granted" && (
              <p className="mt-4" style={{ fontSize: 12, color: "#1B7F4D" }}>通知はオンになっています。</p>
            )}
          </div>

          <button
            onClick={() => setStatus("idle")}
            disabled={!agreed}
            className="btn w-full py-4 rounded-xl transition-transform active:scale-95"
            style={{
              background: agreed ? C.lamp : "#C8CDD3",
              color: agreed ? "#08301C" : "#8C9BB2",
              fontSize: 17,
              fontWeight: 700,
              cursor: agreed ? "pointer" : "not-allowed",
            }}
          >
            はじめる
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full flex justify-center px-4 py-8" style={{ background: C.page, color: C.ink }}>
      {styleTag}

      <div className="w-full" style={{ maxWidth: 440 }}>
        <div className="flex items-end justify-between mb-4">
          <div>
            <div style={{ fontSize: 11, letterSpacing: "0.18em", color: C.paperMute }}>SHACHO NO OGORI</div>
            <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-0.01em" }}>おごりペア</div>
          </div>
          <div className="text-right">
            <div style={{ fontSize: 11, color: C.paperMute, marginBottom: 3 }}>この端末の利用者</div>
            <div
              className="inline-block rounded-lg px-3 py-1"
              style={{ fontSize: 13, fontWeight: 600, background: C.paper, border: "1px solid #C6CBD1" }}
            >
              {me.name}（{me.dept}）
            </div>
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
            ? "他のタブなし — モック社員が相手になります"
            : "他のタブ " + livePeers.length + "件と接続中 — 実際にマッチできます"}
        </div>

        <div className="flex gap-1 p-1 mb-4 rounded-xl" style={{ background: "#D5D9DE" }}>
          <Tab id="wait" label="待機" />
          <Tab id="hist" label="履歴" />
          <Tab id="stat" label="計測" />
        </div>

        {tab === "wait" && (
          <div className="rounded-2xl overflow-hidden" style={{ background: C.chassis }}>
            <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: "1px solid " + C.line }}>
              <div className="flex items-center gap-2">
                <span
                  className={status === "waiting" ? "pulse" : ""}
                  style={{
                    width: 9,
                    height: 9,
                    borderRadius: 999,
                    display: "inline-block",
                    background: status === "waiting" ? C.lamp : status === "matched" ? C.led : C.lampOff,
                  }}
                />
                <span style={{ fontSize: 12, letterSpacing: "0.1em", color: C.mute }} role="status">
                  {status === "waiting" ? "待機中" : status === "matched" ? "マッチ成立" : "停止中"}
                </span>
              </div>
              <span style={{ fontSize: 12, color: C.mute, fontFamily: MONO }}>いま {waitingCount} 人が待機</span>
            </div>

            <div className="px-6 py-8">
              {status === "idle" && (
                <div className="flex flex-col items-center">
                  <div style={{ position: "relative", width: 196, height: 196 }}>
                    <span
                      className="ring"
                      style={{
                        position: "absolute",
                        inset: 0,
                        borderRadius: 999,
                        border: "2px solid " + C.lamp,
                        pointerEvents: "none",
                      }}
                    />
                    <button
                      onClick={join}
                      className="btn rounded-full flex flex-col items-center justify-center transition-transform active:scale-95"
                      style={{
                        width: 196,
                        height: 196,
                        background: C.lamp,
                        border: "none",
                        color: "#06331C",
                        fontSize: 26,
                        fontWeight: 800,
                        letterSpacing: "0.02em",
                        boxShadow: "0 10px 28px rgba(46,204,113,0.35)",
                        position: "relative",
                        zIndex: 1,
                      }}
                    >
                      いま行ける
                      <span style={{ fontSize: 13, fontWeight: 600, marginTop: 6, opacity: 0.75 }}>
                        {ttlMin}分だけ待つ
                      </span>
                    </button>
                  </div>

                  <div className="mt-8 w-full">
                    <div style={{ fontSize: 12, color: C.mute, marginBottom: 8, textAlign: "center" }}>待機する時間</div>
                    <div className="flex gap-2 justify-center flex-wrap">
                      {TTL_CHOICES.map((o) => (
                        <button
                          key={o.v}
                          onClick={() => setTtl(o.v)}
                          className="chip px-4 py-2 rounded-lg transition-colors"
                          style={{
                            background: ttl === o.v ? C.chassisSoft : "transparent",
                            border: "1px solid " + (ttl === o.v ? C.lamp : C.line),
                            color: ttl === o.v ? C.paper : C.mute,
                            fontSize: 13,
                            fontWeight: ttl === o.v ? 700 : 500,
                          }}
                        >
                          {o.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <p className="mt-6 text-center" style={{ fontSize: 13, color: C.mute, lineHeight: 1.7 }}>
                    押すと待機列に入ります。
                    <br />
                    相手が見つかったら通知します。
                  </p>

                  {notifyPerm === "default" && (
                    <button
                      onClick={askNotify}
                      className="btn mt-4 px-4 py-2 rounded-lg"
                      style={{ background: "transparent", border: "1px solid " + C.line, color: C.mute, fontSize: 12 }}
                    >
                      通知を許可する
                    </button>
                  )}
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
                  <div className="flex gap-2 mt-6">
                    <button
                      onClick={() => {
                        setExtra((e) => e + EXTEND);
                        flash("待機時間を10分のばしました");
                      }}
                      className="btn px-5 py-2 rounded-lg"
                      style={{ background: C.chassisSoft, border: "1px solid " + C.lamp, color: C.paper, fontSize: 13, fontWeight: 600 }}
                    >
                      10分のばす
                    </button>
                    <button
                      onClick={() => setStatus("idle")}
                      className="btn px-5 py-2 rounded-lg"
                      style={{ background: "transparent", border: "1px solid " + C.line, color: C.mute, fontSize: 13 }}
                    >
                      待機をやめる
                    </button>
                  </div>
                  {extra > 0 && (
                    <p className="mt-3" style={{ fontSize: 12, color: C.mute }}>
                      合計 {Math.round((ttl + extra) / 60)}分に延長しています
                    </p>
                  )}
                </div>
              )}

              {status === "matched" && match && (
                <div className="drop">
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
                      {match.live && <Badge>別タブの相手</Badge>}
                    </div>

                    <div className="mt-4" style={{ fontSize: 12, color: C.paperMute, lineHeight: 1.7 }}>
                      この人が選ばれた理由：{match.reasons.join("、")}
                    </div>

                    <div className="mt-4 pt-4" style={{ borderTop: "1px solid #E4E4E1" }}>
                      <div className="flex items-baseline justify-between">
                        <div>
                          <div style={{ fontSize: 12, color: C.paperMute }}>集合場所</div>
                          <div style={{ fontSize: 15, fontWeight: 600, marginTop: 2 }}>{SPOT}</div>
                        </div>
                        <div className="text-right">
                          <div style={{ fontSize: 12, color: C.paperMute }}>{meetOver ? "経過" : "集合まで"}</div>
                          <div
                            style={{
                              fontFamily: MONO,
                              fontSize: 22,
                              fontWeight: 700,
                              color: meetOver ? C.red : C.ink,
                              fontVariantNumeric: "tabular-nums",
                            }}
                          >
                            {mmss(Math.abs(meetRemain))}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 pt-4" style={{ borderTop: "1px solid #E4E4E1" }}>
                      <Row
                        label="あなた"
                        value={iConfirmed ? "合流を記録しました" : iHeading ? "向かっています" : "まだ動いていません"}
                        done={iConfirmed}
                      />
                      <Row
                        label={match.emp.name.split(" ")[0] + "さん"}
                        value={peerConfirmed ? "合流を記録しました" : peerHeading ? "向かっています" : "まだ通知を見ていません"}
                        done={peerConfirmed}
                      />
                    </div>

                    {meetOver && !iConfirmed && (
                      <p className="mt-3" style={{ fontSize: 12, color: C.red, lineHeight: 1.6 }}>
                        集合の目安時間を過ぎました。会えたなら記録を、無理なら「行けなくなった」を押してください。
                      </p>
                    )}
                  </div>

                  <div className="flex gap-2 mt-4">
                    {iConfirmed ? (
                      <div
                        className="flex-1 py-3 rounded-xl text-center"
                        style={{ background: C.chassisSoft, color: C.mute, fontSize: 14, fontWeight: 600 }}
                      >
                        相手の確認を待っています…
                      </div>
                    ) : (
                      <button
                        onClick={confirmJoin}
                        className="btn flex-1 py-3 rounded-xl"
                        style={{ background: C.lamp, color: "#06331C", fontSize: 15, fontWeight: 700 }}
                      >
                        合流した
                      </button>
                    )}
                    <button
                      onClick={giveUp}
                      className="btn px-4 py-3 rounded-xl"
                      style={{ background: "transparent", border: "1px solid " + C.line, color: C.mute, fontSize: 14 }}
                    >
                      行けなくなった
                    </button>
                  </div>

                  {!iConfirmed && !iHeading && (
                    <button
                      onClick={sendHeading}
                      className="btn w-full mt-2 py-3 rounded-xl"
                      style={{ background: C.chassisSoft, border: "1px solid " + C.line, color: C.paper, fontSize: 14, fontWeight: 600 }}
                    >
                      いま向かっていると伝える
                    </button>
                  )}

                  <p className="mt-3 text-center" style={{ fontSize: 12, color: C.mute, lineHeight: 1.6 }}>
                    二人とも「合流した」を押すと成立します。片方だけなら未確認として記録されます。
                  </p>
                </div>
              )}

              {status === "expired" && (
                <div className="text-center">
                  <div style={{ fontSize: 15, fontWeight: 600, color: C.paper }}>相手が見つかりませんでした</div>
                  <p className="mt-2" style={{ fontSize: 13, color: C.mute, lineHeight: 1.7 }}>
                    {Math.round((ttl + extra) / 60)}分のあいだ、ほかに待機した人がいませんでした。
                    <br />
                    お昼どきや15時台は人が集まりやすいです。
                  </p>
                  <button
                    onClick={join}
                    className="btn mt-6 px-6 py-3 rounded-xl"
                    style={{ background: C.lamp, color: "#06331C", fontSize: 15, fontWeight: 700 }}
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
                    <div style={{ fontSize: 12, fontWeight: 600, color: RESULT_COLOR[h.result] }}>
                      {RESULT_LABEL[h.result]}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <p className="mt-4" style={{ fontSize: 12, color: C.paperMute, lineHeight: 1.7 }}>
              「未確認」は、片方だけが合流を記録したものです。
            </p>
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
              <Metric label="部署をまたいだ割合" value={stats.crossRate} unit="%" />
              <Metric label="双方が確認した率" value={stats.showRate} unit="%" alert={stats.showRate < 70} />
              <Metric label="待機時間の中央値" value={mmss(stats.medWait)} mono />
              <Metric label="未接触の社員" value={stats.unmet} unit="人" />
            </div>
            <p className="mt-4" style={{ fontSize: 12, color: C.paperMute, lineHeight: 1.7 }}>
              待機の有効期限が{ttlMin}分なら1日あたり{Math.round(480 / ttlMin)}枠。押下数が30回を下回ると、ほとんどマッチしません。
              <br />
              片側だけの申告は {stats.unconfN}件（合流率の分母には残しています）。
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
              待機時間を使い切る
            </Demo>
            <Demo
              onClick={() => {
                if (status === "matched") setMeetAt(Date.now() - 1000);
                else flash("マッチ成立中に使えます");
              }}
            >
              集合時間を過ぎさせる
            </Demo>
            <Demo
              onClick={() => {
                if (status === "matched" && match && !match.live) setPeerConfirmed(true);
                else flash("モック相手とマッチ中に使えます");
              }}
            >
              相手の確認を再現
            </Demo>
            <Demo
              onClick={() => {
                setStatus("idle");
                clearMatch();
                setJoinedAt(null);
                setExtra(0);
                setHistory(SEED.filter((h) => h.name !== me.name));
                setPushes(4);
                flash("このタブを初期状態に戻しました");
              }}
            >
              リセット
            </Demo>
          </div>
          <p className="mt-3" style={{ fontSize: 12, color: C.paperMute, lineHeight: 1.6 }}>
            2つ目のタブで同じURLを開き、利用者を別の人に切り替えると、両方で「いま行ける」を押したときに実際にマッチします。
          </p>
        </div>

        {toast && (
          <div className="mt-4 px-4 py-3 rounded-lg" style={{ background: C.chassis, color: C.paper, fontSize: 13 }} role="status">
            {toast}
          </div>
        )}
      </div>
    </div>
  );
}

function Step({ n, title, children }) {
  return (
    <div className="flex gap-3 py-2">
      <div
        className="flex items-center justify-center rounded-full shrink-0"
        style={{ width: 24, height: 24, background: C.chassis, color: C.paper, fontSize: 12, fontWeight: 700 }}
      >
        {n}
      </div>
      <div>
        <div style={{ fontSize: 14, fontWeight: 700 }}>{title}</div>
        <div style={{ fontSize: 12.5, color: C.paperMute, lineHeight: 1.7, marginTop: 2 }}>{children}</div>
      </div>
    </div>
  );
}

function Row({ label, value, done }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span style={{ fontSize: 13, color: C.paperMute }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: done ? "#1B7F4D" : "#3F4650" }}>
        {done ? "✓ " : ""}
        {value}
      </span>
    </div>
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
      className="btn px-3 py-2 rounded-lg transition-colors"
      style={{ background: "#D9DDE2", color: "#3F4650", fontSize: 12, fontWeight: 600 }}
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
