/**
 * MVP mock ads — free users only. No popups, interstitials, video, or launch ads.
 * Placements: Today, Schedule, Lists (max one per screen). Never in task detail,
 * settings, Pro, Focus, or while keyboard is open.
 */
import type { AdPlacement, MockAd } from './types';

const MOCK_ADS: MockAd[] = [
  {
    id: 'calm-productivity',
    title: 'Plan your day better',
    body: 'Simple tools for building better routines.',
    sponsor: 'Sponsored',
    cta: 'Learn more',
  },
  {
    id: 'focus-tools',
    title: 'Stay focused',
    body: 'Tools for calm productivity.',
    sponsor: 'Sponsored',
    cta: 'Open',
  },
  {
    id: 'routine-builder',
    title: 'Build better routines',
    body: 'Small systems for busy people.',
    sponsor: 'Sponsored',
    cta: 'View',
  },
];

const PLACEMENT_INDEX: Record<AdPlacement, number> = {
  today_after_tasks: 0,
  schedule_bottom: 1,
  lists_bottom: 2,
  done_bottom: 0,
};

export function getAdForPlacement(placement: AdPlacement): MockAd {
  const index = PLACEMENT_INDEX[placement] % MOCK_ADS.length;
  return MOCK_ADS[index];
}

export function shouldShowAds(isPro: boolean): boolean {
  return !isPro;
}
