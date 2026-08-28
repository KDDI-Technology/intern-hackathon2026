import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarClock, CheckCircle2, MapPin, Search, Soup, Users } from "lucide-react";
import { createRealtimeChannel } from "../realtime";

const STORAGE_KEY = "office-hub:lunch-support-posts";

const personKey = (person) => String(person?.email || person?.name || "").toLowerCase();
const groupKey = (participants) => participants.map(personKey).sort().join("|");

function dateTimeLocal(hoursAhead) {
  const date = new Date(Date.now() + hoursAhead * 60 * 60 * 1000);
  date.setMinutes(Math.ceil(date.getMinutes() / 10) * 10, 0, 0);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

const SAMPLE_POSTS = [
  {
    id: "sample-cafe",
    datetime: dateTimeLocal(26),
    place: "1階エントランス",
    capacity: 4,
    food: "カフェ・軽食",
    creator: { name: "佐藤 美咲", email: "misaki.sato@example.com" },
    participants: [
      { name: "佐藤 美咲", email: "misaki.sato@example.com" },
      { name: "田中 健一", email: "kenichi.tanaka@example.com" },
    ],
    createdAt: Date.now() - 7_200_000,
  },
  {
    id: "sample-ramen",
    datetime: dateTimeLocal(50),
    place: "正面玄関前",
    capacity: null,
    food: "ラーメン",
    creator: { name: "鈴木 陽子", email: "yoko.suzuki@example.com" },
    participants: [
      { name: "鈴木 陽子", email: "yoko.suzuki@example.com" },
      { name: "高橋 大輔", email: "daisuke.takahashi@example.com" },
      { name: "伊藤 さくら", email: "sakura.ito@example.com" },
    ],
    createdAt: Date.now() - 3_600_000,
  },
];

function readPosts() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    return Array.isArray(saved) ? saved : SAMPLE_POSTS;
  } catch {
    return SAMPLE_POSTS;
  }
}

function savePosts(posts) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(posts));
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat("ja-JP", {
    month: "numeric",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function sameMonth(value, now = new Date()) {
  const date = new Date(value);
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
}

export default function LunchSupport({ currentUser }) {
  const [posts, setPosts] = useState(readPosts);
  const [showForm, setShowForm] = useState(false);
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState("time");
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({
    datetime: dateTimeLocal(24),
    place: "",
    capacity: "",
    food: "",
  });
  const channelRef = useRef(null);
  const me = useMemo(
    () => ({ name: currentUser.name, email: currentUser.email }),
    [currentUser.email, currentUser.name],
  );
  const myKey = personKey(me);

  useEffect(() => {
    const realtime = createRealtimeChannel("lunch-support");
    channelRef.current = realtime;
    realtime.onmessage = ({ data }) => {
      if (data.t !== "snapshot") return;
      if (!data.initialized) {
        realtime.postMessage({ t: "init", posts: readPosts() });
        return;
      }
      if (Array.isArray(data.posts)) {
        setPosts(data.posts);
        savePosts(data.posts);
      }
    };

    const syncTabs = (event) => {
      if (event.key !== STORAGE_KEY || !event.newValue) return;
      try { setPosts(JSON.parse(event.newValue)); } catch { /* 無効な保存値は無視 */ }
    };
    window.addEventListener("storage", syncTabs);
    return () => {
      realtime.close();
      channelRef.current = null;
      window.removeEventListener("storage", syncTabs);
    };
  }, []);

  const persist = (nextPosts) => {
    setPosts(nextPosts);
    savePosts(nextPosts);
    channelRef.current?.postMessage({ t: "replace", posts: nextPosts });
  };

  const monthlyUsage = posts.filter(
    (post) =>
      sameMonth(post.datetime) &&
      post.participants.length >= 3 &&
      post.participants.some((person) => personKey(person) === myKey),
  ).length;

  const visiblePosts = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    const filtered = posts.filter((post) => {
      if (!keyword) return true;
      return [
        post.place,
        post.food,
        post.creator.name,
        ...post.participants.map((person) => person.name),
      ].some((value) => String(value || "").toLowerCase().includes(keyword));
    });
    return [...filtered].sort((a, b) => {
      if (sortBy === "newest") return b.createdAt - a.createdAt;
      if (sortBy === "place") return a.place.localeCompare(b.place, "ja");
      if (sortBy === "remaining") {
        const aRemain = a.capacity ? a.capacity - a.participants.length : 999;
        const bRemain = b.capacity ? b.capacity - b.participants.length : 999;
        return bRemain - aRemain;
      }
      return new Date(a.datetime) - new Date(b.datetime);
    });
  }, [posts, query, sortBy]);

  const createPost = (event) => {
    event.preventDefault();
    const capacity = form.capacity ? Number(form.capacity) : null;
    if (!form.datetime || !form.place.trim()) {
      setMessage("時間と集合場所を入力してください。");
      return;
    }
    if (capacity && capacity < 3) {
      setMessage("人数制限は3人以上で設定してください。");
      return;
    }
    const post = {
      id: `lunch-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      datetime: form.datetime,
      place: form.place.trim(),
      capacity,
      food: form.food.trim(),
      creator: me,
      participants: [me],
      createdAt: Date.now(),
    };
    persist([post, ...posts]);
    setForm({ datetime: dateTimeLocal(24), place: "", capacity: "", food: "" });
    setShowForm(false);
    setMessage("募集を掲載しました。");
  };

  const toggleParticipation = (post) => {
    const isCreator = personKey(post.creator) === myKey;
    const isParticipant = post.participants.some((person) => personKey(person) === myKey);
    if (isCreator) {
      setMessage("募集者は参加を取り消せません。");
      return;
    }

    let participants;
    if (isParticipant) {
      participants = post.participants.filter((person) => personKey(person) !== myKey);
    } else {
      if (post.capacity && post.participants.length >= post.capacity) {
        setMessage("この募集は定員に達しています。");
        return;
      }
      if (monthlyUsage >= 4) {
        setMessage("ランチサポートは月4回まで利用できます。");
        return;
      }
      participants = [...post.participants, me];
      if (participants.length >= 3) {
        const proposedGroup = groupKey(participants);
        const alreadyUsed = posts.some(
          (other) => other.id !== post.id && other.participants.length >= 3 && groupKey(other.participants) === proposedGroup,
        );
        if (alreadyUsed) {
          setMessage("同じメンバー構成では再度利用できません。");
          return;
        }
      }
    }

    const nextPosts = posts.map((item) => item.id === post.id ? { ...item, participants } : item);
    persist(nextPosts);
    setMessage(isParticipant ? "参加を取り消しました。" : participants.length >= 3 ? "参加しました。3人以上になり成立しました。" : "参加しました。");
  };

  return (
    <section className="lunch-support" aria-labelledby="lunch-support-title">
      <div className="lunch-summary">
        <div>
          <p className="lunch-eyebrow">LUNCH SUPPORT</p>
          <h2 id="lunch-support-title">ランチ募集掲示板</h2>
          <p>3人以上集まると成立します。同一メンバーでの再利用はできません。</p>
        </div>
        <div className="lunch-usage"><strong>{monthlyUsage}</strong><span>/ 4回</span><small>今月の利用</small></div>
      </div>

      <button className="lunch-create-toggle" type="button" onClick={() => setShowForm((value) => !value)}>
        {showForm ? "募集フォームを閉じる" : "＋ 新しく募集する"}
      </button>

      {showForm && (
        <form className="lunch-form" onSubmit={createPost}>
          <label>時間<input type="datetime-local" value={form.datetime} onChange={(event) => setForm({ ...form, datetime: event.target.value })} /></label>
          <label>集合場所<input value={form.place} onChange={(event) => setForm({ ...form, place: event.target.value })} placeholder="例：1階エントランス" /></label>
          <label>人数制限（任意）<input type="number" min="3" value={form.capacity} onChange={(event) => setForm({ ...form, capacity: event.target.value })} placeholder="制限なし" /></label>
          <label>食事内容（任意）<input value={form.food} onChange={(event) => setForm({ ...form, food: event.target.value })} placeholder="例：和食、ラーメン" /></label>
          <button type="submit">この内容で募集する</button>
        </form>
      )}

      {message && <p className="lunch-message" role="status">{message}</p>}

      <div className="lunch-tools">
        <label className="lunch-search"><Search size={16} aria-hidden="true" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="場所・料理・名前で検索" /></label>
        <select value={sortBy} onChange={(event) => setSortBy(event.target.value)} aria-label="募集の並び順">
          <option value="time">時間が近い順</option>
          <option value="newest">新着順</option>
          <option value="remaining">空き人数順</option>
          <option value="place">集合場所順</option>
        </select>
      </div>

      <div className="lunch-posts">
        {visiblePosts.map((post) => {
          const established = post.participants.length >= 3;
          const joined = post.participants.some((person) => personKey(person) === myKey);
          const full = Boolean(post.capacity && post.participants.length >= post.capacity);
          return (
            <article className={`lunch-post ${established ? "is-established" : ""}`} key={post.id}>
              <div className="lunch-post-head">
                <span className={`lunch-state ${established ? "established" : "recruiting"}`}>
                  {established ? <><CheckCircle2 size={14} />成立</> : `あと${3 - post.participants.length}人で成立`}
                </span>
                <span className="lunch-count"><Users size={15} />{post.participants.length}{post.capacity ? ` / ${post.capacity}` : "人"}</span>
              </div>
              <div className="lunch-detail"><CalendarClock size={17} /><strong>{formatDateTime(post.datetime)}</strong></div>
              <div className="lunch-detail"><MapPin size={17} /><span>{post.place}</span></div>
              <div className="lunch-detail"><Soup size={17} /><span>{post.food || "食事内容は相談して決定"}</span></div>
              <div className="lunch-people">
                <p><span>募集者</span><strong>{post.creator.name}</strong></p>
                <p><span>参加者</span><strong>{post.participants.map((person) => person.name).join("、")}</strong></p>
              </div>
              <button
                type="button"
                className={joined ? "joined" : ""}
                disabled={!joined && full}
                onClick={() => toggleParticipation(post)}
              >
                {personKey(post.creator) === myKey ? "あなたの募集" : joined ? "参加を取り消す" : full ? "定員に達しました" : "参加する"}
              </button>
            </article>
          );
        })}
        {!visiblePosts.length && <p className="lunch-empty">条件に合う募集はありません。</p>}
      </div>
    </section>
  );
}
