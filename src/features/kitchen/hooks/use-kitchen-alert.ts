import { useCallback, useEffect, useRef, useState } from "react";
import type { KitchenOrder } from "./use-kitchen-tickets";

/** One alert per newly observed order; refreshes and status changes stay silent. */
export function useKitchenAlert(tickets: KitchenOrder[], ready: boolean) {
  const context = useRef<AudioContext | null>(null);
  const seen = useRef<Set<string> | null>(null);
  const nextSoundAt = useRef(0);
  const [enabled, setEnabled] = useState(false);

  const play = useCallback(() => {
    const audio = context.current;
    if (!audio || audio.state !== "running") return;
    // Two groups of three alternating tones, queued to avoid clipping on batches.
    const start = Math.max(audio.currentTime, nextSoundAt.current);
    for (let i = 0; i < 6; i++) {
      const at = start + i * 0.28 + (i >= 3 ? 0.25 : 0);
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.type = "square";
      oscillator.frequency.value = i % 2 ? 1046 : 784;
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(0.3, at + 0.015);
      gain.gain.setValueAtTime(0.3, at + 0.18);
      gain.gain.linearRampToValueAtTime(0, at + 0.23);
      oscillator.connect(gain);
      gain.connect(audio.destination);
      oscillator.start(at);
      oscillator.stop(at + 0.24);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    }
    nextSoundAt.current = start + 2;
  }, []);

  const activate = useCallback(async () => {
    if (!context.current) {
      const created = new AudioContext();
      created.onstatechange = () => setEnabled(created.state === "running");
      context.current = created;
    }
    const audio = context.current;
    await audio.resume();
    if (audio.state !== "running") throw new Error("No se pudo activar el audio");
    setEnabled(true);
    play();
  }, [play]);

  useEffect(() => {
    if (!ready) return;
    if (!seen.current) {
      seen.current = new Set(tickets.map((ticket) => ticket.order_id));
      return;
    }
    for (const ticket of tickets) {
      if (!seen.current.has(ticket.order_id)) {
        seen.current.add(ticket.order_id);
        play();
      }
    }
  }, [tickets, ready, play]);

  useEffect(() => () => {
    const audio = context.current;
    if (audio) {
      audio.onstatechange = null;
      void audio.close();
      context.current = null;
    }
  }, []);

  return { enabled, activate };
}
