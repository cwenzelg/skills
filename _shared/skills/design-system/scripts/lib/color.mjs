// color.mjs - colour parsing and the measurements the design-system checks need: WCAG 2.2
// relative luminance and contrast, APCA lightness contrast (report only), alpha compositing,
// CIE Lab and deltaE76 for "nearest token" and palette matching. Dependency-free.

const NAMED = {
  black: '#000000', white: '#ffffff', transparent: 'rgba(0,0,0,0)', red: '#ff0000', green: '#008000',
  blue: '#0000ff', gray: '#808080', grey: '#808080', orange: '#ffa500', yellow: '#ffff00', purple: '#800080',
};

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function channel(part, max = 255) {
  const p = part.trim();
  if (p.endsWith('%')) return (parseFloat(p) / 100) * max;
  return parseFloat(p);
}

function hslToRgb(h, s, l) {
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}

function oklchToRgb(L, C, H) {
  const hr = (H * Math.PI) / 180;
  const a = C * Math.cos(hr);
  const b = C * Math.sin(hr);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;
  const lin = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return lin.map((c) => {
    const v = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
    return clamp(v, 0, 1) * 255;
  });
}

/**
 * Parses a CSS colour (hex 3/4/6/8, rgb()/rgba(), hsl()/hsla(), oklch(), a few names) or a DTCG
 * colour object ({ hex } or { colorSpace: 'srgb', components, alpha }). Returns { r, g, b, a }
 * with r/g/b 0-255 and a 0-1, or null when it is not a colour.
 */
export function parseColor(input) {
  if (input && typeof input === 'object') {
    if (typeof input.hex === 'string') {
      const c = parseColor(input.hex);
      return c && input.alpha != null ? { ...c, a: input.alpha } : c;
    }
    if (input.colorSpace === 'srgb' && Array.isArray(input.components)) {
      const [r, g, b] = input.components.map((x) => x * 255);
      return { r, g, b, a: input.alpha ?? 1 };
    }
    return null;
  }
  if (typeof input !== 'string') return null;
  let s = input.trim().toLowerCase();
  if (NAMED[s]) s = NAMED[s];
  let m = s.match(/^#([0-9a-f]{3,8})$/);
  if (m) {
    let h = m[1];
    if (h.length === 3 || h.length === 4) h = [...h].map((x) => x + x).join('');
    if (h.length !== 6 && h.length !== 8) return null;
    const n = (i) => parseInt(h.slice(i, i + 2), 16);
    return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? n(6) / 255 : 1 };
  }
  m = s.match(/^(rgba?|hsla?|oklch)\(([^)]*)\)$/);
  if (!m) return null;
  const parts = m[2].replace(/\s*\/\s*/, ',').split(/[\s,]+/).filter(Boolean);
  const alpha = parts.length > 3 ? channel(parts[3], 1) : 1;
  if (m[1].startsWith('rgb')) {
    const [r, g, b] = parts.slice(0, 3).map((p) => channel(p));
    return { r, g, b, a: alpha };
  }
  if (m[1].startsWith('hsl')) {
    const [r, g, b] = hslToRgb(parseFloat(parts[0]), channel(parts[1], 1), channel(parts[2], 1));
    return { r, g, b, a: alpha };
  }
  const L = parts[0].endsWith('%') ? parseFloat(parts[0]) / 100 : parseFloat(parts[0]);
  const [r, g, b] = oklchToRgb(L, parseFloat(parts[1]), parseFloat(parts[2]));
  return { r, g, b, a: alpha };
}

export const toHex = ({ r, g, b, a = 1 }) => {
  const h = (v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}${a < 1 ? h(a * 255) : ''}`;
};

/** fg (may be translucent) laid over an opaque bg. */
export function composite(fg, bg) {
  const a = fg.a ?? 1;
  return { r: fg.r * a + bg.r * (1 - a), g: fg.g * a + bg.g * (1 - a), b: fg.b * a + bg.b * (1 - a), a: 1 };
}

/** WCAG 2.x relative luminance of an opaque colour. */
export function luminance({ r, g, b }) {
  const lin = (v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG 2.2 contrast ratio of two opaque colours, 1-21. */
export function contrastRatio(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** APCA-W3 0.0.98G lightness contrast Lc (text on background); a report value, never a gate. */
export function apcaLc(text, bg) {
  const y = ({ r, g, b }) => {
    let v = 0.2126729 * (r / 255) ** 2.4 + 0.7151522 * (g / 255) ** 2.4 + 0.072175 * (b / 255) ** 2.4;
    if (v <= 0.022) v += (0.022 - v) ** 1.414;
    return v;
  };
  const yt = y(text);
  const yb = y(bg);
  if (Math.abs(yb - yt) < 0.0005) return 0;
  let out;
  if (yb > yt) {
    const sapc = (yb ** 0.56 - yt ** 0.57) * 1.14;
    out = sapc < 0.1 ? 0 : sapc - 0.027;
  } else {
    const sapc = (yb ** 0.65 - yt ** 0.62) * 1.14;
    out = sapc > -0.1 ? 0 : sapc + 0.027;
  }
  return out * 100;
}

/** CIE Lab (D65) of an opaque colour. */
export function toLab({ r, g, b }) {
  const lin = (v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const [R, G, B] = [lin(r), lin(g), lin(b)];
  const X = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047;
  const Y = 0.2126 * R + 0.7152 * G + 0.0722 * B;
  const Z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883;
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
}

/** deltaE76 between two colours; alpha is folded in by compositing both over white. */
export function deltaE(a, b) {
  const white = { r: 255, g: 255, b: 255, a: 1 };
  const [l1, a1, b1] = toLab(composite(a, white));
  const [l2, a2, b2] = toLab(composite(b, white));
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2) + Math.abs((a.a ?? 1) - (b.a ?? 1)) * 50;
}

/** Every colour literal in a CSS fragment (hex, rgb[a], hsl[a], oklch), in order. */
export function colorLiterals(text) {
  const re = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|oklch)\([^)]*\)/g;
  return [...text.matchAll(re)].map((m) => ({ text: m[0], index: m.index, color: parseColor(m[0]) })).filter((x) => x.color);
}
