import { useCallback, useRef } from "react";

export type SpeechLang = "en-US" | "es-ES" | "ru-RU" | "ca-ES";

function synth(): SpeechSynthesis | null {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
  return window.speechSynthesis ?? null;
}

function voiceFor(engine: SpeechSynthesis, lang: SpeechLang): SpeechSynthesisVoice | null {
  const voices = engine.getVoices?.() ?? [];
  const normalized = (code: string) => code.replace("_", "-").toLowerCase();
  return (
    voices.find(v => normalized(v.lang) === lang.toLowerCase()) ??
    voices.find(v => normalized(v.lang).startsWith(lang.slice(0, 2).toLowerCase())) ??
    null
  );
}

export function useSpeechSynthesis() {
  const current = useRef<SpeechSynthesisUtterance | null>(null);

  const speak = useCallback(
    (text: string, lang: SpeechLang, rate: number = 1, pitch: number = 1) => {
      const engine = synth();
      if (!engine || !text.trim()) return;

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = lang;
      utterance.rate = rate;
      utterance.pitch = pitch;
      const voice = voiceFor(engine, lang);
      if (voice) utterance.voice = voice;
      current.current = utterance;

      const start = () => {
        engine.speak(utterance);
        engine.resume?.();
      };
      if (engine.speaking || engine.pending) {
        engine.cancel();
        window.setTimeout(start, 80);
      } else {
        start();
      }
    },
    []
  );

  const cancel = useCallback(() => {
    synth()?.cancel();
  }, []);

  return { speak, cancel };
}
