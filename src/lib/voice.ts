// Voice input architecture: uses the browser Web Speech API when present; a server-side STT provider can replace it.
import { useCallback, useRef, useState } from 'react';
import type { Lang } from './types';

type Recognition = { lang: string; interimResults: boolean; onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void; onerror: () => void; onend: () => void; start(): void; stop(): void };

export function useVoiceInput(lang: Lang, onText: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [unsupported, setUnsupported] = useState(false);
  const rec = useRef<Recognition | null>(null);
  const start = useCallback(() => {
    const W = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
    const Ctor = W.SpeechRecognition || W.webkitSpeechRecognition;
    if (!Ctor) { setUnsupported(true); return; }
    const r = new Ctor();
    r.lang = lang === 'ru' ? 'ru-RU' : lang === 'tk' ? 'tk-TM' : 'en-US';
    r.interimResults = false;
    r.onresult = (e) => { const text = Array.from(e.results).map((x) => x[0].transcript).join(' '); if (text) onText(text); };
    r.onerror = () => setListening(false);
    r.onend = () => setListening(false);
    rec.current = r;
    setListening(true);
    try { r.start(); } catch { setListening(false); }
  }, [lang, onText]);
  const stop = useCallback(() => { rec.current?.stop(); setListening(false); }, []);
  return { listening, unsupported, start, stop, setUnsupported };
}
