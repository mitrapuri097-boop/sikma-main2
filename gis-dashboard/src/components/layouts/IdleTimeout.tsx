import { useEffect, useRef } from "react";

// Logout otomatis setelah 30 menit tanpa aktivitas
const IDLE_TIMEOUT = 30 * 60 * 1000;

export default function IdleTimeout() {
  const timeoutRef = useRef<number | null>(null);

  const logout = () => {
    localStorage.removeItem("smiti_token");
    localStorage.removeItem("smiti_user");

    sessionStorage.removeItem("smiti_token");
    sessionStorage.removeItem("smiti_user");

    window.location.replace("/login");
  };

  const resetTimer = () => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = window.setTimeout(() => {
      logout();
    }, IDLE_TIMEOUT);
  };

  useEffect(() => {
    const events = [
      "mousemove",
      "mousedown",
      "keydown",
      "scroll",
      "touchstart",
      "click",
    ];

    const handleActivity = () => {
      resetTimer();
    };

    events.forEach((event) => {
      window.addEventListener(event, handleActivity, {
        passive: true,
      });
    });

    window.addEventListener("focus", handleActivity);

    // Mulai timer ketika component aktif
    resetTimer();

    return () => {
      events.forEach((event) => {
        window.removeEventListener(event, handleActivity);
      });

      window.removeEventListener("focus", handleActivity);

      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return null;
}