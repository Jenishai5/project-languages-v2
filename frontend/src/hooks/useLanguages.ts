import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { loadSettings, saveSettings, type LanguageSettings } from '../lib/lessonsApi';

const STORAGE_KEY = 'turtletalk.languages';
const DEFAULT_SETTINGS: LanguageSettings = { native_lang: 'spa', learning_lang: 'eng' };

function readStored(): LanguageSettings | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as LanguageSettings) : null;
  } catch {
    return null;
  }
}

function writeStored(settings: LanguageSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    return;
  }
}

export function useLanguages() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<LanguageSettings>(() => readStored() ?? DEFAULT_SETTINGS);
  const [chosen, setChosen]     = useState<boolean>(() => readStored() !== null);

  useEffect(() => {
    if (!user) return;
    loadSettings().then(saved => {
      if (saved) {
        setSettings(saved);
        setChosen(true);
        writeStored(saved);
      }
    });
  }, [user]);

  const update = useCallback(
    (next: LanguageSettings) => {
      setSettings(next);
      setChosen(true);
      writeStored(next);
      if (user) saveSettings(next).catch(() => {});
    },
    [user],
  );

  return { settings, chosen, update };
}
