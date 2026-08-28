import { useState } from "react";
import { Users, Armchair, Camera as CameraIcon, House, LogOut, Moon, Sun, UserRound, Utensils } from "lucide-react";
import "./App.css";
import { useTheme } from "./useTheme";
import Camera from "./components/Camera";
import OgoriPair from "./components/OgoriPair";
import SeatAndTemperature from "./components/SeatAndTemperature";
import LunchSupport from "./components/LunchSupport";

const APPS = [
  {
    id: "ogori",
    label: "おごりペア",
    sub: "社内ランチマッチング",
    icon: Users,
    accent: "var(--app-ogori-accent)",
    accentSoft: "var(--app-ogori-soft)",
    gradient: "linear-gradient(135deg, #f4a11c 0%, #ef7d22 100%)",
  },
  {
    id: "lunch",
    label: "ランチサポート",
    sub: "みんなでランチ募集",
    icon: Utensils,
    accent: "var(--app-lunch-accent)",
    accentSoft: "var(--app-lunch-soft)",
    gradient: "linear-gradient(135deg, #f03c98 0%, #d52b71 100%)",
  },
  {
    id: "seat",
    label: "座席・温度",
    sub: "空席状況と室温の記録",
    icon: Armchair,
    accent: "var(--app-seat-accent)",
    accentSoft: "var(--app-seat-soft)",
    gradient: "linear-gradient(135deg, #22c55e 0%, #0f9f69 100%)",
  },
  {
    id: "camera",
    label: "在庫確認",
    sub: "お菓子コーナーの様子",
    icon: CameraIcon,
    accent: "var(--app-camera-accent)",
    accentSoft: "var(--app-camera-soft)",
    gradient: "linear-gradient(135deg, #6554e8 0%, #4433c7 100%)",
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

function ThemeToggle({ theme, onToggle }) {
  const toDark = theme === "light";
  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={onToggle}
      aria-label={toDark ? "ダークモードに切り替える" : "ライトモードに切り替える"}
      title={toDark ? "ダークモードに切り替える" : "ライトモードに切り替える"}
    >
      {toDark ? <Moon size={16} aria-hidden="true" /> : <Sun size={16} aria-hidden="true" />}
    </button>
  );
}

function AuthScreen({ onLogin, theme, onToggleTheme }) {
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
        <div className="auth-head">
          <div className="auth-mark"><UserRound size={25} aria-hidden="true" /></div>
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
        </div>
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

function HomeScreen({ currentUser, onOpen }) {
  const firstName = currentUser.name?.trim().split(/[\s　]+/)[0] || "利用者";

  return (
    <section className="home-screen" aria-labelledby="home-title">
      <div className="home-intro">
        <p className="home-eyebrow">OFFICE SERVICES</p>
        <h2 id="home-title">{firstName}さん、こんにちは</h2>
        <p>利用するサービスを選んでください。</p>
      </div>

      <div className="home-grid">
        {APPS.map((app) => {
          const Icon = app.icon;
          return (
            <button
              key={app.id}
              type="button"
              className="home-service-card"
              style={{ background: app.gradient }}
              onClick={() => onOpen(app.id)}
            >
              <span className="home-service-icon"><Icon size={34} aria-hidden="true" /></span>
              <span className="home-service-copy">
                <strong>{app.label}</strong>
                <small>{app.sub}</small>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function App() {
  const { theme, toggleTheme } = useTheme();
  const [active, setActive] = useState("home");
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

  if (!currentUser) return <AuthScreen onLogin={setCurrentUser} theme={theme} onToggleTheme={toggleTheme} />;

  const logout = () => {
    localStorage.removeItem(SESSION_KEY);
    setCurrentUser(null);
  };

  return (
    <main className="app">
      <header className="app-header">
        <div>
          <h1>オフィスハブ</h1>
          <p className="app-header-sub">{activeApp?.sub || "社内サービスホーム"}</p>
        </div>
        <div className="user-menu">
          <span>{currentUser.name}</span>
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
          {active !== "home" && (
            <button type="button" onClick={() => setActive("home")} aria-label="ホームへ戻る"><House size={16} /></button>
          )}
          <button type="button" onClick={logout} aria-label="ログアウト"><LogOut size={16} /></button>
        </div>
      </header>

      {active !== "home" && <nav className="app-nav">
        {APPS.map((app) => {
          const Icon = app.icon;
          const isActive = app.id === active;
          return (
            <button
              key={app.id}
              className="app-nav-btn"
              onClick={() => setActive(app.id)}
              style={{
                background: isActive ? app.accentSoft : "var(--surface)",
                borderColor: isActive ? app.accent : "var(--border)",
              }}
            >
              <span
                className="app-nav-icon"
                style={{
                  background: isActive ? app.accent : "var(--surface-2)",
                  color: isActive ? "var(--app-on-accent)" : "var(--text-muted)",
                }}
              >
                <Icon size={18} aria-hidden="true" />
              </span>
              <span
                className="app-nav-label"
                style={{
                  fontWeight: isActive ? 700 : 500,
                  color: isActive ? "var(--text)" : "var(--text-muted)",
                }}
              >
                {app.label}
              </span>
            </button>
          );
        })}
      </nav>}

      <div className="app-body">
        {active === "home" && <HomeScreen currentUser={currentUser} onOpen={setActive} />}
        {active === "ogori" && <OgoriPair currentUser={currentUser} />}
        {active === "seat" && (
          <div className="app-card">
            <SeatAndTemperature currentUser={currentUser} />
          </div>
        )}
        {active === "lunch" && <LunchSupport currentUser={currentUser} />}
        {active === "camera" && <Camera />}
      </div>
    </main>
  );
}

export default App;
