"use client";

import { useEffect, useState } from "react";

const units = ["DAYS", "HRS", "MIN", "SEC"];

export function Countdown({ target, label = "CLOSING IN" }: { target: string; label?: string }) {
  // Keep the server and first browser render identical. Start the live clock
  // after hydration, so elapsed seconds cannot cause a text mismatch.
  const [clock, setClock] = useState<{ target: string; remaining: number } | null>(null);

  useEffect(() => {
    const tick = () => setClock({
      target,
      remaining: Math.max(0, new Date(target).getTime() - Date.now()),
    });
    const initialTick = setTimeout(tick, 0);
    const timer = setInterval(tick, 1000);
    return () => {
      clearTimeout(initialTick);
      clearInterval(timer);
    };
  }, [target]);

  const remaining = clock?.target === target ? clock.remaining : null;
  const values = remaining === null ? null : [
    Math.floor(remaining / 86400000),
    Math.floor(remaining / 3600000) % 24,
    Math.floor(remaining / 60000) % 60,
    Math.floor(remaining / 1000) % 60,
  ];

  return (
    <div className="countdown">
      <strong>{label} <small className="countdown-zone">WAT</small></strong>
      <div>
        {units.map((unit, index) => (
          <span key={unit}>
            <b>{values ? String(values[index]).padStart(2, "0") : "--"}</b>
            <small>{unit}</small>
          </span>
        ))}
      </div>
    </div>
  );
}
