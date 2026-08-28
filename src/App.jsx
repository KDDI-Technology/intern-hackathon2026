import { useState } from "react";
import { Users, Armchair, Camera as CameraIcon, LogOut, UserRound } from "lucide-react";
import "./App.css";
import Camera from "./components/Camera";
import OgoriPair from "./components/OgoriPair";
import SeatAndTemperature from "./components/SeatAndTemperature";

const APPS = [
  {
    id: "ogori",
    label: "おごりペア",
    sub: "社内ランチマッチング",
    icon: Users,
    accent: "#F5A524",
    accentSoft: "#FDF0DA",
  },
  {
    id: "seat",
    label: "座席・温度",
    sub: "空席状況と室温の記録",
    icon: Armchair,
    accent: "#16a34a",
    accentSoft: "#DCFCE7",
  },
  {
    id: "camera",
    label: "在庫確認",
    sub: "お菓子コーナーの様子",
    icon: CameraIcon,
    accent: "#222222",
    accentSoft: "#E7E5E4",
  },
];

const USERS_KEY = "office-hub:demo-users";
const SESSION_KEY = "office-hub:demo-session";
const REMOVED_USER_EMAILS = new Set(["ferid16zero@gmail.com"]);
const DEMO_USER = {
  name: "山田 太郎",
  email: "yamada@example.com",
  password: "demo1234",
};

function readUsers() {
  try {
    const saved = JSON.parse(localStorage.getItem(USERS_KEY) || "[]");
    const activeUsers = saved.filter(
      (user) => !REMOVED_USER_EMAILS.has(String(user.email || "").toLowerCase()),
    );
    if (activeUsers.length !== saved.length) {
      localStorage.setItem(USERS_KEY, JSON.stringify(activeUsers));
    }
    return activeUsers.some((user) => user.email === DEMO_USER.email)
      ? activeUsers
      : [DEMO_USER, ...activeUsers];
  } catch {
    return [DEMO_USER];
  }
}

function AuthScreen({ onLogin }) {
  const [mode, setMode] = useState("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState(mode === "login" ? DEMO_USER.email : "");
  const [password, setPassword] = useState(mode === "login" ? DEMO_USER.password : "");
  const [error, setError] = useState("");

  const switchMode = (nextMode) => {
    setMode(nextMode);
    setError("");
    setName("");
    setEmail(nextMode === "login" ? DEMO_USER.email : "");
    setPassword(nextMode === "login" ? DEMO_USER.password : "");
  };

  const submit = (event) => {
    event.preventDefault();
    const users = readUsers();

    if (mode === "register") {
      if (!name.trim() || !email.trim() || password.length < 6) {
        setError("氏名・メールアドレス・6文字以上のパスワードを入力してください");
        return;
      }
      if (users.some((user) => user.email.toLowerCase() === email.trim().toLowerCase())) {
        setError("このメールアドレスは登録済みです");
        return;
      }
      const user = { name: name.trim(), email: email.trim().toLowerCase(), password };
      localStorage.setItem(USERS_KEY, JSON.stringify([...users, user]));
      localStorage.setItem(SESSION_KEY, JSON.stringify(user));
      onLogin(user);
      return;
    }

    const user = users.find(
      (item) => item.email.toLowerCase() === email.trim().toLowerCase() && item.password === password,
    );
    if (!user) {
      setError("メールアドレスまたはパスワードが違います");
      return;
    }
    localStorage.setItem(SESSION_KEY, JSON.stringify(user));
    onLogin(user);
  };

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="auth-mark"><UserRound size={25} aria-hidden="true" /></div>
        <p className="auth-eyebrow">OFFICE CONSOLE</p>
        <h1>オフィスハブ</h1>
        <p className="auth-description">社内サービスを利用するにはログインしてください。</p>

        <div className="auth-tabs" role="tablist" aria-label="認証方法">
          <button type="button" className={mode === "login" ? "active" : ""} onClick={() => switchMode("login")}>ログイン</button>
          <button type="button" className={mode === "register" ? "active" : ""} onClick={() => switchMode("register")}>新規登録</button>
        </div>

        <form className="auth-form" onSubmit={submit}>
          {mode === "register" && (
            <label>氏名<input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" /></label>
          )}
          <label>メールアドレス<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" /></label>
          <label>パスワード<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === "login" ? "current-password" : "new-password"} /></label>
          {error && <p className="auth-error" role="alert">{error}</p>}
          <button className="auth-submit" type="submit">{mode === "login" ? "ログイン" : "アカウントを作成"}</button>
        </form>

        {mode === "login" && <p className="demo-account">デモ：yamada@example.com / demo1234</p>}
      </section>
    </main>
  );
}

function App() {
  const [active, setActive] = useState("ogori");
  const [currentUser, setCurrentUser] = useState(() => {
    readUsers();
    try {
      const user = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
      if (REMOVED_USER_EMAILS.has(String(user?.email || "").toLowerCase())) {
        localStorage.removeItem(SESSION_KEY);
        return null;
      }
      return user;
    }
    catch { return null; }
  });
  const activeApp = APPS.find((a) => a.id === active);

  if (!currentUser) return <AuthScreen onLogin={setCurrentUser} />;

  const logout = () => {
    localStorage.removeItem(SESSION_KEY);
    setCurrentUser(null);
  };

  return (
    <main className="app">
      <header className="app-header">
        <div>
          <h1>オフィスハブ</h1>
          <p className="app-header-sub">{activeApp.sub}</p>
        </div>
        <div className="user-menu">
          <span>{currentUser.name}</span>
          <button type="button" onClick={logout} aria-label="ログアウト"><LogOut size={16} /></button>
        </div>
      </header>

      <nav className="app-nav">
        {APPS.map((app) => {
          const Icon = app.icon;
          const isActive = app.id === active;
          return (
            <button
              key={app.id}
              className="app-nav-btn"
              onClick={() => setActive(app.id)}
              style={{
                background: isActive ? app.accentSoft : "#ffffff",
                borderColor: isActive ? app.accent : "#e1e4e8",
              }}
            >
              <span
                className="app-nav-icon"
                style={{
                  background: isActive ? app.accent : "#f0f1f3",
                  color: isActive ? "#ffffff" : "#6e7887",
                }}
              >
                <Icon size={18} aria-hidden="true" />
              </span>
              <span
                className="app-nav-label"
                style={{
                  fontWeight: isActive ? 700 : 500,
                  color: isActive ? "#141a24" : "#6e7887",
                }}
              >
                {app.label}
              </span>
            </button>
          );
        })}
      </nav>

      <div className="app-body">
        {active === "ogori" && <OgoriPair currentUser={currentUser} />}
        {active === "seat" && (
          <div className="app-card">
            <SeatAndTemperature currentUser={currentUser} />
          </div>
        )}
        {active === "camera" && <Camera />}
      </div>
    </main>
  );
}

export default App;
