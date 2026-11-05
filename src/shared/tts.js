// tts.js — Mandarin text-to-speech through the Web Speech API (on-device voices).
export const ttsAvailable = () => typeof speechSynthesis !== 'undefined';

function pickVoice() {
  let voices = [];
  try { voices = speechSynthesis.getVoices() || []; } catch { return null; }
  const norm = (v) => (v.lang || '').toLowerCase().replace('_', '-');
  return voices.find((v) => norm(v) === 'zh-cn') || voices.find((v) => norm(v).startsWith('zh-cn')) || voices.find((v) => norm(v).startsWith('cmn')) || voices.find((v) => norm(v).startsWith('zh')) || null;
}
if (ttsAvailable()) { try { speechSynthesis.getVoices(); speechSynthesis.addEventListener?.('voiceschanged', () => speechSynthesis.getVoices()); } catch { /* ignore */ } }

export const hasChineseVoice = () => !!pickVoice();

export function speak(text, { rate = 0.9, onend, onerror } = {}) {
  if (!ttsAvailable() || !text) { onerror?.(); return false; }
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const v = pickVoice();
    if (v) u.voice = v;
    u.lang = (v && v.lang) || 'zh-CN';
    u.rate = rate;
    u.onend = () => onend?.();
    u.onerror = () => onerror?.();
    speechSynthesis.speak(u);
    return true;
  } catch { onerror?.(); return false; }
}
export function cancelSpeech() { try { speechSynthesis.cancel(); } catch { /* ignore */ } }
