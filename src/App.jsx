import { useState } from "react";
import { Users, Armchair, Camera as CameraIcon } from "lucide-react";
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

function App() {
  const [active, setActive] = useState("ogori");
  const activeApp = APPS.find((a) => a.id === active);

  return (
    <main className="app">
      <header className="app-header">
        <h1>オフィスハブ</h1>
        <p className="app-header-sub">{activeApp.sub}</p>
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
        {active === "ogori" && <OgoriPair />}
        {active === "seat" && (
          <div className="app-card">
            <SeatAndTemperature />
          </div>
        )}
        {active === "camera" && <Camera />}
      </div>
    </main>
  );
}

export default App;
