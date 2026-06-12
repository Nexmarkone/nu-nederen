import { useEffect } from "react";
import { useStore } from "./store";
import { unlockAudio } from "./audio";
import { Toasts } from "./components/Toasts";
import { Game } from "./screens/Game";
import { Home } from "./screens/Home";
import { Lobby } from "./screens/Lobby";
import { Rules } from "./screens/Rules";
import { Topliste } from "./screens/Topliste";

export default function App() {
  const screen = useStore((s) => s.screen);

  // iOS: AudioContext must be unlocked by a user gesture.
  useEffect(() => {
    const unlock = () => unlockAudio();
    window.addEventListener("pointerdown", unlock, { passive: true });
    return () => window.removeEventListener("pointerdown", unlock);
  }, []);

  return (
    <div className="relative z-[1] flex min-h-dvh flex-col">
      {screen === "home" && <Home />}
      {screen === "lobby" && <Lobby />}
      {screen === "game" && <Game />}
      {screen === "rules" && <Rules />}
      {screen === "topliste" && <Topliste />}
      <Toasts />
    </div>
  );
}
