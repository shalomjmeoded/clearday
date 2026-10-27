import type { ThemeTokens } from './tokens';

/** WCAG relative luminance / contrast ratio (sRGB). */
function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => channel(parseInt(h.slice(i, i + 2), 16)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(foreground: string, background: string): number {
  const a = luminance(foreground);
  const b = luminance(background);
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

export interface ContrastPair {
  what: string;
  foreground: keyof ThemeTokens;
  background: keyof ThemeTokens;
  /** WCAG AA: 4.5 for small text, 3 for large text and UI boundaries. */
  minimum: number;
}

/**
 * Foreground/background pairs the app actually renders.
 *
 * Deliberately not the cartesian product of every text colour and every
 * surface: `accent` on `sectionBg`, for instance, never occurs, because a chip
 * that turns accent-coloured also swaps its background to `accent`/`accentSoft`.
 * Checking pairs that never render would force the brand colour darker to
 * satisfy a combination no user ever sees.
 */
export const CONTRAST_PAIRS: ContrastPair[] = [
  // Body and meta text on each surface it lands on. `sectionBg` is the darkest
  // surface in most palettes, so it — not `background` — is the binding case.
  { what: 'body text on background', foreground: 'text', background: 'background', minimum: 4.5 },
  { what: 'body text on card', foreground: 'text', background: 'card', minimum: 4.5 },
  { what: 'body text on input', foreground: 'text', background: 'inputBg', minimum: 4.5 },
  { what: 'search text on section', foreground: 'text', background: 'sectionBg', minimum: 4.5 },
  { what: 'meta text on background', foreground: 'mutedText', background: 'background', minimum: 4.5 },
  { what: 'meta text on card', foreground: 'mutedText', background: 'card', minimum: 4.5 },
  { what: 'placeholder on input', foreground: 'mutedText', background: 'inputBg', minimum: 4.5 },
  { what: 'meta text on section', foreground: 'mutedText', background: 'sectionBg', minimum: 4.5 },
  { what: 'inactive tab label on tab bar', foreground: 'mutedText', background: 'tabBar', minimum: 4.5 },

  // Accent as text: screen accents, links, the active tab tint, active toolbar
  // buttons (whose fill is `accentSoft`).
  { what: 'accent text on background', foreground: 'accent', background: 'background', minimum: 4.5 },
  { what: 'accent text on card', foreground: 'accent', background: 'card', minimum: 4.5 },
  { what: 'active tab tint on tab bar', foreground: 'accent', background: 'tabBar', minimum: 4.5 },
  { what: 'active toolbar button', foreground: 'accent', background: 'accentSoft', minimum: 4.5 },
  // The sort pill keeps body-coloured text once its menu is open.
  { what: 'open sort pill', foreground: 'text', background: 'accentSoft', minimum: 4.5 },

  // Destructive text: field errors, "Remove reminder", the danger button.
  { what: 'danger text on background', foreground: 'danger', background: 'background', minimum: 4.5 },
  { what: 'danger text on card', foreground: 'danger', background: 'card', minimum: 4.5 },

  // Swipe rails and filled controls: a 10px/700 label in `onAccent` sits on
  // each of these, so they take the small-text threshold, not 3:1.
  { what: 'label on edit rail', foreground: 'onAccent', background: 'actionEdit', minimum: 4.5 },
  { what: 'label on star rail', foreground: 'onAccent', background: 'actionPin', minimum: 4.5 },
  { what: 'label on repeat rail', foreground: 'onAccent', background: 'actionRepeat', minimum: 4.5 },
  { what: 'label on done rail', foreground: 'onAccent', background: 'actionRead', minimum: 4.5 },
  { what: 'label on delete rail', foreground: 'onAccent', background: 'danger', minimum: 4.5 },
  { what: 'label on archive rail', foreground: 'onAccent', background: 'swipeArchive', minimum: 4.5 },
  { what: 'label on tomorrow rail', foreground: 'onAccent', background: 'swipeTomorrow', minimum: 4.5 },
  { what: 'label on filled button', foreground: 'onAccent', background: 'accent', minimum: 4.5 },
  { what: 'checkmark on checkbox', foreground: 'onAccent', background: 'checkboxFill', minimum: 3 },
];

export interface ContrastFailure extends ContrastPair {
  palette: string;
  actual: number;
}

/** Returns every pair in `tokens` that falls below its minimum. */
export function findContrastFailures(
  palette: string,
  tokens: ThemeTokens
): ContrastFailure[] {
  const failures: ContrastFailure[] = [];
  for (const pair of CONTRAST_PAIRS) {
    const actual = contrastRatio(tokens[pair.foreground], tokens[pair.background]);
    if (actual + 1e-9 < pair.minimum) {
      failures.push({ ...pair, palette, actual });
    }
  }
  return failures;
}
