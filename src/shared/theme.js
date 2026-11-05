// theme.js — design tokens. Two surfaces (dark near-black, light warm paper),
// a terracotta accent, and four tone palettes. Rendered as CSS custom
// properties so the content popup (shadow DOM) and the extension pages share
// one stylesheet vocabulary.

export const THEMES = {
  dark: {
    bg: '#0E0E0F', surface: '#161617', surface2: '#202022', surfaceHi: '#2A2A2C',
    border: 'rgba(255,255,255,0.08)', borderStrong: 'rgba(255,255,255,0.16)',
    text: '#F3EFE9', textSoft: 'rgba(243,239,233,0.64)', textFaint: 'rgba(243,239,233,0.46)',
    onAccent: '#1A0E08', shadow: '0 14px 44px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.06)',
    scrim: 'rgba(0,0,0,0.6)', track: 'rgba(255,255,255,0.08)',
    accent: '#E0795B', accentText: '#EC9277', accentTint: 'rgba(224,121,91,0.16)',
    good: '#79B6A4', goodTint: 'rgba(121,182,164,0.16)', bad: '#E8857E',
  },
  light: {
    bg: '#F4F0E7', surface: '#FBF8F1', surface2: '#FFFFFF', surfaceHi: '#EFEADF',
    border: 'rgba(44,36,28,0.10)', borderStrong: 'rgba(44,36,28,0.20)',
    text: '#2A2521', textSoft: 'rgba(42,37,33,0.62)', textFaint: 'rgba(42,37,33,0.50)',
    onAccent: '#FFFFFF', shadow: '0 14px 44px rgba(60,40,25,0.18), 0 0 0 1px rgba(44,36,28,0.08)',
    scrim: 'rgba(40,30,20,0.34)', track: 'rgba(0,0,0,0.07)',
    accent: '#D96A4A', accentText: '#B84E2C', accentTint: 'rgba(224,121,91,0.16)',
    good: '#3C7E6B', goodTint: 'rgba(60,126,107,0.14)', bad: '#C2483C',
  },
};

// 1 = high · 2 = rising · 3 = dipping · 4 = falling · 0 = neutral
export const TONE_PALETTES = {
  warm: { label: 'Warm', dark: { 1: '#E89A92', 2: '#93C49B', 3: '#94B4DD', 4: '#C6A0D4', 0: '#9C958D' }, light: { 1: '#C25A4E', 2: '#4E8A55', 3: '#3E6FA8', 4: '#8A569E', 0: '#998F84' } },
  vivid: { label: 'Vivid', dark: { 1: '#F08A86', 2: '#7BCB80', 3: '#82AAF0', 4: '#CB8CE2', 0: '#8C8C8C' }, light: { 1: '#C8362F', 2: '#2E8B40', 3: '#2F5FC0', 4: '#8033B0', 0: '#7E7E7E' } },
  pastel: { label: 'Pastel', dark: { 1: '#D9AFA9', 2: '#AECBB1', 3: '#AEC1DB', 4: '#C9B5D3', 0: '#9C958D' }, light: { 1: '#B07A70', 2: '#6E9670', 3: '#6E86B0', 4: '#9A7FA8', 0: '#A0978C' } },
  pleco: { label: 'Pleco', dark: { 1: '#F2655B', 2: '#5FC169', 3: '#5C92EC', 4: '#C56FE0', 0: '#9A9A9A' }, light: { 1: '#D32F2F', 2: '#2E8B3D', 3: '#2554C7', 4: '#8E24AA', 0: '#777777' } },
};

export const FONT_UI = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, system-ui, sans-serif";
export const FONT_HAN = "'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Noto Sans CJK SC', 'Noto Sans SC', 'Source Han Sans SC', 'WenQuanYi Micro Hei', sans-serif";
export const FONT_HAN_TRAD = "'PingFang TC', 'Hiragino Sans CNS', 'Microsoft JhengHei', 'Noto Sans CJK TC', 'Noto Sans TC', sans-serif";

// Resolve 'auto' against the system preference. `prefersDark` is a boolean the
// caller reads from matchMedia (keeps this module DOM-free for tests).
export function resolveScheme(theme, prefersDark) {
  if (theme === 'dark' || theme === 'light') return theme;
  return prefersDark ? 'dark' : 'light';
}

// Build the full token set for a settings object + resolved scheme.
export function tokensFor(settings, scheme) {
  const base = THEMES[scheme] || THEMES.dark;
  const pal = (TONE_PALETTES[settings.tonePalette] || TONE_PALETTES.warm)[scheme];
  const tones = settings.toneColors === false ? { 1: base.text, 2: base.text, 3: base.text, 4: base.text, 0: base.textSoft } : pal;
  return { ...base, scheme, tones };
}

// The CSS custom properties for a token set, as one declaration string.
export function cssVars(t, scale = 1) {
  const d = {
    '--zw-bg': t.bg, '--zw-surface': t.surface, '--zw-surface2': t.surface2, '--zw-surface-hi': t.surfaceHi,
    '--zw-border': t.border, '--zw-border-strong': t.borderStrong,
    '--zw-text': t.text, '--zw-text-soft': t.textSoft, '--zw-text-faint': t.textFaint,
    '--zw-accent': t.accent, '--zw-accent-text': t.accentText, '--zw-accent-tint': t.accentTint, '--zw-on-accent': t.onAccent,
    '--zw-good': t.good, '--zw-good-tint': t.goodTint, '--zw-bad': t.bad,
    '--zw-shadow': t.shadow, '--zw-scrim': t.scrim, '--zw-track': t.track,
    '--zw-tone1': t.tones[1], '--zw-tone2': t.tones[2], '--zw-tone3': t.tones[3], '--zw-tone4': t.tones[4], '--zw-tone0': t.tones[0],
    '--zw-font-ui': FONT_UI, '--zw-font-han': FONT_HAN, '--zw-font-han-trad': FONT_HAN_TRAD,
    '--zw-scale': String(scale),
    'color-scheme': t.scheme,
  };
  return Object.entries(d).map(([k, v]) => `${k}:${v}`).join(';');
}
