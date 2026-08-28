import { useCallback, useEffect, useState } from "react";

export const THEME_KEY = "office-hub:theme";

const prefersDark = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-color-scheme: dark)").matches;

function readSavedTheme() {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    return saved === "light" || saved === "dark" ? saved : null;
  } catch {
    return null;
  }
}

/**
 * 初回は OS の設定に従い、ユーザーが自分で切り替えたらその選択を優先する。
 * 手動で選ぶまでは OS 側の変更にも追従する。
 */
export function useTheme() {
  const [theme, setTheme] = useState(
    () => readSavedTheme() || (prefersDark() ? "dark" : "light"),
  );

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    if (readSavedTheme()) return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const follow = (event) => setTheme(event.matches ? "dark" : "light");
    media.addEventListener("change", follow);
    return () => media.removeEventListener("change", follow);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((current) => {
      const next = current === "dark" ? "light" : "dark";
      try {
        localStorage.setItem(THEME_KEY, next);
      } catch {
        /* 保存できなくても表示は切り替える */
      }
      return next;
    });
  }, []);

  return { theme, toggleTheme };
}
