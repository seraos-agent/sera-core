import { useState, useEffect } from 'react';
import { LandingPage } from './components/landing/LandingPage';
import { FONT_LINK_ID } from './theme';

function useFonts() {
  useEffect(() => {
    if (document.getElementById(FONT_LINK_ID)) return;
    const link = document.createElement("link");
    link.id = FONT_LINK_ID;
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap";
    document.head.appendChild(link);
  }, []);
}

function App() {
  useFonts();
  
  const [mode] = useState<"light" | "dark">(() => {
    const saved = localStorage.getItem("sera_landing_theme");
    return (saved === "light" || saved === "dark") ? saved : "light";
  });

  useEffect(() => {
    localStorage.setItem("sera_landing_theme", mode);
  }, [mode]);

  return (
    <div style={{ backgroundColor: mode === "light" ? "#f3f4f6" : "#000", minHeight: "100vh", position: "relative" }}>
      <LandingPage />
    </div>
  );
}

export default App;
