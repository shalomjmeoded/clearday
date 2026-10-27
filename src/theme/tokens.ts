export interface ThemeTokens {
  background: string;
  card: string;
  text: string;
  mutedText: string;
  border: string;
  accent: string;
  accentSoft: string;
  danger: string;
  tabBar: string;
  inputBg: string;
  checkboxFill: string;
  swipeTomorrow: string;
  swipeArchive: string;
  sectionBg: string;
  onAccent: string;
  paperLine: string;
  actionEdit: string;
  actionPin: string;
  actionRepeat: string;
  actionRead: string;
}

/*
 * Text colours are held to WCAG AA 4.5:1 against the *darkest* surface they
 * land on — usually `sectionBg`, not `background`. The swipe-rail colours are
 * backgrounds for a 10px/700 label in `onAccent`, so they are held to 4.5:1
 * too rather than the 3:1 that larger text would allow.
 */
export const lightTheme: ThemeTokens = {
  background: '#F6F3ED',
  card: '#FFFDF9',
  text: '#1A1917',
  // 4.54:1 on sectionBg. Carries every meta line, side date, placeholder and
  // inactive tab, so it is small text and gets the full 4.5:1.
  mutedText: '#6C6A65',
  border: '#E6E1D8',
  accent: '#4F6B52',
  accentSoft: '#E8EFE9',
  // Used as small text (field errors, "Remove reminder") as well as the delete
  // rail's fill, so it takes the stricter of the two requirements.
  danger: '#974A3B',
  tabBar: '#F6F3ED',
  inputBg: '#FFFDF9',
  checkboxFill: '#4F6B52',
  swipeTomorrow: '#5A7A5E',
  // Dark enough that the white icon/label on the archive action stays legible.
  swipeArchive: '#78746E',
  sectionBg: '#EFEBE3',
  onAccent: '#FFFDF9',
  paperLine: '#E7DCC7',
  actionEdit: '#52759A',
  actionPin: '#9A6C26',
  actionRepeat: '#5A7A5E',
  actionRead: '#766B9A',
};

export const darkTheme: ThemeTokens = {
  background: '#0F0E0D',
  card: '#1A1917',
  text: '#F4F1EA',
  mutedText: '#AAA69D',
  border: '#34312D',
  accent: '#8FAF92',
  accentSoft: '#252E26',
  danger: '#D48474',
  tabBar: '#0F0E0D',
  inputBg: '#1A1917',
  checkboxFill: '#8FAF92',
  swipeTomorrow: '#6B8A6E',
  // Light enough that the dark icon/label on the archive action stays legible.
  swipeArchive: '#7D7A76',
  sectionBg: '#181614',
  onAccent: '#0F0E0D',
  paperLine: '#38332D',
  actionEdit: '#7FA1C7',
  actionPin: '#D8A85B',
  actionRepeat: '#8FAF92',
  actionRead: '#A99BD0',
};

export const lightPalettes: Record<string, ThemeTokens> = {
  classic: lightTheme,
  yellow: {
    ...lightTheme,
    // 4.55:1 on this palette's sectionBg (#F6E7A7).
    mutedText: '#696762',
    background: '#FFF5C9',
    card: '#FFF9DD',
    inputBg: '#FFFBE8',
    sectionBg: '#F6E7A7',
    border: '#E7D584',
    accent: '#7A6418',
    accentSoft: '#F0E5AE',
    checkboxFill: '#7A6418',
    paperLine: '#E2CE75',
  },
  pink: {
    ...lightTheme,
    // 4.53:1 on this palette's sectionBg (#F6D2DB).
    mutedText: '#62605B',
    background: '#FFE8EE',
    card: '#FFF5F7',
    inputBg: '#FFF8FA',
    sectionBg: '#F6D2DB',
    border: '#E8B9C7',
    accent: '#99506D',
    accentSoft: '#F6E1E8',
    checkboxFill: '#99506D',
    paperLine: '#E4B3C3',
  },
  mint: {
    ...lightTheme,
    // 4.51:1 on this palette's sectionBg (#D2E8D1).
    mutedText: '#666560',
    background: '#E7F4E7',
    card: '#F5FFF5',
    inputBg: '#FAFFFA',
    sectionBg: '#D2E8D1',
    border: '#B7D2B6',
    accent: '#3F7547',
    accentSoft: '#DCEEDE',
    checkboxFill: '#3F7547',
    paperLine: '#B8D3B6',
  },
  sky: {
    ...lightTheme,
    // 4.51:1 on this palette's sectionBg (#D4E2F7).
    mutedText: '#66645F',
    background: '#E7F0FF',
    card: '#F5F9FF',
    inputBg: '#FAFCFF',
    sectionBg: '#D4E2F7',
    border: '#B9CCE8',
    accent: '#386D9E',
    accentSoft: '#DEEBF7',
    checkboxFill: '#386D9E',
    paperLine: '#B9CCE8',
  },
  graphite: {
    ...lightTheme,
    background: '#F2F2F0',
    card: '#FCFCFA',
    text: '#202020',
    mutedText: '#696965',
    border: '#DDDDD9',
    accent: '#3F3F3C',
    accentSoft: '#E8E7E3',
    tabBar: '#F2F2F0',
    inputBg: '#FCFCFA',
    checkboxFill: '#3F3F3C',
    swipeTomorrow: '#6D6A64',
    sectionBg: '#E9E9E5',
    onAccent: '#FCFCFA',
    paperLine: '#D8D7D2',
    actionPin: '#887150',
    actionRepeat: '#6D6A64',
  },
};

export const darkPalettes: Record<string, ThemeTokens> = {
  classic: darkTheme,
  yellow: {
    ...darkTheme,
    accent: '#D8C26A',
    accentSoft: '#302B18',
    checkboxFill: '#D8C26A',
    paperLine: '#3A321E',
  },
  pink: {
    ...darkTheme,
    accent: '#E5A4BA',
    accentSoft: '#33212A',
    checkboxFill: '#E5A4BA',
    paperLine: '#3A2730',
  },
  mint: {
    ...darkTheme,
    accent: '#9FCCA3',
    accentSoft: '#1F3022',
    checkboxFill: '#9FCCA3',
    paperLine: '#263A28',
  },
  sky: {
    ...darkTheme,
    accent: '#9BBDE3',
    accentSoft: '#1F2A39',
    checkboxFill: '#9BBDE3',
    paperLine: '#273447',
  },
  graphite: {
    ...darkTheme,
    background: '#0D0D0D',
    card: '#171717',
    inputBg: '#1D1D1D',
    sectionBg: '#161616',
    border: '#292929',
    accent: '#E6E0D5',
    accentSoft: '#282521',
    checkboxFill: '#E6E0D5',
    paperLine: '#2B2B2B',
    onAccent: '#0D0D0D',
  },
};
