import { useCallback, useEffect, useRef, useState } from "react";

type OrderSound = "kitchen-new" | "cash-ready";

const SOUND_PROFILES = {
  "kitchen-new": {
    waveform: "square",
    frequencies: [784, 1046, 784, 1046, 784, 1046],
    spacing: 0.28,
    groupPause: 0.25,
    duration: 0.23,
    volume: 0.3,
  },
  "cash-ready": {
    waveform: "sine",
    frequencies: [523, 659, 784, 523, 659, 784],
    spacing: 0.4,
    groupPause: 0.5,
    duration: 0.35,
    volume: 0.65,
  },
} as const;

export function useOrderSound(kind: OrderSound) {
  const context = useRef<AudioContext | null>(null);
  const nextSoundAt = useRef(0);
  const [enabled, setEnabled] = useState(false);

  const play = useCallback(() => {
    const audio = context.current;
    if (!audio || audio.state !== "running") return;
    const profile = SOUND_PROFILES[kind];
    // Queue complete patterns so simultaneous orders never overlap.
    const start = Math.max(audio.currentTime, nextSoundAt.current);
    for (let i = 0; i < profile.frequencies.length; i++) {
      const at = start + i * profile.spacing + (i >= 3 ? profile.groupPause : 0);
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.type = profile.waveform;
      oscillator.frequency.value = profile.frequencies[i];
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(profile.volume, at + 0.015);
      if (kind === "cash-ready") {
        gain.gain.exponentialRampToValueAtTime(0.001, at + profile.duration);
      } else {
        gain.gain.setValueAtTime(profile.volume, at + 0.18);
        gain.gain.linearRampToValueAtTime(0, at + profile.duration);
      }
      oscillator.connect(gain);
      gain.connect(audio.destination);
      oscillator.start(at);
      oscillator.stop(at + profile.duration + 0.01);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    }
    nextSoundAt.current = start + profile.frequencies.length * profile.spacing + profile.groupPause + 0.1;
  }, [kind]);

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

  useEffect(() => () => {
    const audio = context.current;
    if (audio) {
      audio.onstatechange = null;
      void audio.close();
      context.current = null;
    }
  }, []);

  return { enabled, activate, play };
}
