import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

/**
 * Speaks a message that has no focusable home of its own — a toast, a
 * validation error, a count that just changed.
 *
 * `accessibilityLiveRegion` is Android-only, so it cannot carry these on its
 * own; this is the cross-platform path.
 */
export function announce(message: string): void {
  if (!message) return;
  if (Platform.OS === 'ios') {
    // Queue rather than cut VoiceOver off mid-sentence.
    AccessibilityInfo.announceForAccessibilityWithOptions(message, {
      queue: true,
    });
    return;
  }
  AccessibilityInfo.announceForAccessibility(message);
}

/** Announces `message` whenever it changes to a new non-empty value. */
export function useAnnounceOnChange(message: string | undefined): void {
  const previous = useRef(message);
  useEffect(() => {
    if (message === previous.current) return;
    previous.current = message;
    if (message) announce(message);
  }, [message]);
}

/** Tracks whether VoiceOver / TalkBack is currently running. */
export function useScreenReaderEnabled(): boolean {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void AccessibilityInfo.isScreenReaderEnabled().then((value) => {
      if (!cancelled) setEnabled(value);
    });
    const subscription = AccessibilityInfo.addEventListener(
      'screenReaderChanged',
      setEnabled
    );
    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, []);

  return enabled;
}

/**
 * How long a transient message should stay up, honouring the user's own
 * timing needs rather than the visual default.
 *
 * Android exposes "Time to take action" directly. iOS has no equivalent, so a
 * running screen reader stands in for it: hearing the message, swiping to the
 * action and activating it takes far longer than reading and tapping.
 */
/**
 * The timeout logic on its own, so the invariant that matters can be tested:
 * the result is never shorter than `baseMs`. Anything that lags — the
 * platform recommendation, the screen-reader flag — may only extend it.
 */
export function resolveAccessibleTimeout(
  baseMs: number,
  {
    screenReaderEnabled = false,
    extendForScreenReader = false,
    recommendedMs = 0,
  }: {
    screenReaderEnabled?: boolean;
    extendForScreenReader?: boolean;
    recommendedMs?: number;
  } = {}
): number {
  const wanted =
    extendForScreenReader && screenReaderEnabled
      ? Math.max(baseMs, SCREEN_READER_MIN_TIMEOUT_MS)
      : baseMs;
  return Math.max(wanted, recommendedMs);
}

export function useAccessibleTimeout(
  baseMs: number,
  { extendForScreenReader = false }: { extendForScreenReader?: boolean } = {}
): number {
  const screenReaderEnabled = useScreenReaderEnabled();

  // Android's recommendation arrives a tick late, so it is tracked on the side
  // and may only extend the synchronous value. Returning it as the whole
  // duration instead would hand callers a stale number on the render the
  // timeout starts — for a toast, a 0 ms one that dismisses it immediately.
  const [recommended, setRecommended] = useState(0);
  const wanted = resolveAccessibleTimeout(baseMs, {
    screenReaderEnabled,
    extendForScreenReader,
  });

  useEffect(() => {
    if (Platform.OS !== 'android' || wanted <= 0) return;
    let cancelled = false;
    void AccessibilityInfo.getRecommendedTimeoutMillis(wanted)
      .then((value) => {
        if (!cancelled) setRecommended(value);
      })
      .catch(() => {
        // No recommendation available; `wanted` stands.
      });
    return () => {
      cancelled = true;
    };
  }, [wanted]);

  return Math.max(wanted, recommended);
}

/** Long enough to hear a message, find its action and activate it. */
const SCREEN_READER_MIN_TIMEOUT_MS = 15000;

/**
 * Hides a decorative subtree from VoiceOver and TalkBack. Use when a parent
 * already speaks the same information.
 */
export const DECORATIVE = {
  accessibilityElementsHidden: true,
  importantForAccessibility: 'no-hide-descendants',
} as const;
