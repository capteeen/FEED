'use client';
// Agent voices for Pits, using the browser's built-in speech engine
// (Web Speech API). No API key, no backend. Each agent gets a stable voice,
// pitch and rate from its handle, type and personality.
// Phase 2: swap `speakNow` for a TTS API (ElevenLabs / OpenAI) streaming audio.
import type { Agent } from './types';
import { hashString } from './rng';

export interface Line {
  handle: string;
  text: string;
}

type Listener = (ev: { type: 'start' | 'end'; line: Line }) => void;

const queue: Line[] = [];
const listeners = new Set<Listener>();
let current: Line | null = null;
let enabled = false;
let voices: SpeechSynthesisVoice[] = [];

export const voiceSupported = () => typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;

function loadVoices() {
  if (!voiceSupported()) return;
  const all = window.speechSynthesis.getVoices();
  const en = all.filter((v) => /^en[-_]/i.test(v.lang));
  voices = (en.length ? en : all).sort((a, b) => a.name.localeCompare(b.name));
}
if (voiceSupported()) {
  loadVoices();
  window.speechSynthesis.addEventListener?.('voiceschanged', loadVoices);
}

/** Voice settings for an agent; stable across sessions. */
export function voiceFor(a: Pick<Agent, 'handle' | 'type' | 'personality'>) {
  const h = hashString(a.handle);
  const voice = voices.length ? voices[h % voices.length] : undefined;
  let pitch = 0.75 + ((h >>> 8) % 60) / 100; // 0.75–1.35
  let rate = 0.95 + ((h >>> 16) % 20) / 100; // 0.95–1.15
  switch (a.personality) {
    case 'hype': rate += 0.15; pitch += 0.1; break;
    case 'degen': rate += 0.1; break;
    case 'doomer': rate -= 0.12; pitch -= 0.15; break;
    case 'zen': rate -= 0.15; break;
    case 'villain': pitch -= 0.2; rate -= 0.05; break;
    case 'quant': rate += 0.05; pitch -= 0.05; break;
  }
  if (a.type === 'shiller') rate += 0.05;
  return { voice, pitch: Math.max(0.5, Math.min(2, pitch)), rate: Math.max(0.7, Math.min(1.5, rate)) };
}

/** Must be called from a user gesture (click/tap) so browsers allow audio. */
export function enableVoice() {
  if (!voiceSupported()) return false;
  enabled = true;
  loadVoices();
  // iOS needs a (silent) utterance inside the gesture to unlock speech
  const u = new SpeechSynthesisUtterance(' ');
  u.volume = 0;
  window.speechSynthesis.speak(u);
  return true;
}

export function disableVoice() {
  enabled = false;
  queue.length = 0;
  if (voiceSupported()) window.speechSynthesis.cancel();
  if (current) {
    const line = current;
    current = null;
    listeners.forEach((l) => l({ type: 'end', line }));
  }
}

export const voiceEnabled = () => enabled;
export const nowSpeaking = () => current;

export function onVoice(l: Listener) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** Queue a line. Keeps at most two waiting so audio never lags far behind the captions. */
export function speakLine(line: Line, agent: Pick<Agent, 'handle' | 'type' | 'personality'>) {
  if (!enabled || !voiceSupported()) return;
  queue.push(line);
  while (queue.length > 2) queue.shift();
  agentsCache.set(line.handle, agent);
  if (!current) next();
}

const agentsCache = new Map<string, Pick<Agent, 'handle' | 'type' | 'personality'>>();

function clean(text: string) {
  return text
    .replace(/\$([A-Z][A-Z0-9]{1,11})\b/g, '$1') // "$FADEB" → "FADEB"
    .replace(/@([a-z0-9_]+)/gi, '$1')
    .replace(/(\d)k\b/g, '$1 k')
    .replace(/(\d(?:\.\d+)?)x\b/g, '$1 x')
    .replace(/−/g, 'minus ')
    .replace(/[🚀🌕🦍📐🌧️🕵️🧘🦹🔥💀👀🫡🐂🐻😂]/gu, '');
}

function next() {
  const line = queue.shift();
  if (!line || !enabled) {
    current = null;
    return;
  }
  const agent = agentsCache.get(line.handle) ?? { handle: line.handle, type: 'trader' as const, personality: undefined };
  const v = voiceFor(agent);
  const u = new SpeechSynthesisUtterance(clean(line.text));
  if (v.voice) u.voice = v.voice;
  u.pitch = v.pitch;
  u.rate = v.rate;
  u.lang = v.voice?.lang ?? 'en-US';
  current = line;
  listeners.forEach((l) => l({ type: 'start', line }));
  const done = () => {
    if (current !== line) return;
    current = null;
    listeners.forEach((l) => l({ type: 'end', line }));
    // small gap between speakers
    setTimeout(next, 350);
  };
  u.onend = done;
  u.onerror = done;
  window.speechSynthesis.speak(u);
  // safety: some engines never fire onend
  setTimeout(() => current === line && done(), 20_000);
}
