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

export const lightTheme: ThemeTokens = {
  background: '#F6F3ED',
  card: '#FFFDF9',
  text: '#1A1917',
  mutedText: '#7A7872',
  border: '#E6E1D8',
  accent: '#4F6B52',
  accentSoft: '#E8EFE9',
  danger: '#B85C4A',
  tabBar: '#F6F3ED',
  inputBg: '#FFFDF9',
  checkboxFill: '#4F6B52',
  swipeTomorrow: '#5A7A5E',
  swipeArchive: '#9A9690',
  sectionBg: '#EFEBE3',
  onAccent: '#FFFDF9',
  paperLine: '#E7DCC7',
  actionEdit: '#52759A',
  actionPin: '#B9822E',
  actionRepeat: '#5A7A5E',
  actionRead: '#766B9A',
};

export const darkTheme: ThemeTokens = {
  background: '#121110',
  card: '#1C1B19',
  text: '#EDEBE5',
  mutedText: '#8C8A84',
  border: '#2C2A28',
  accent: '#8FAF92',
  accentSoft: '#252E26',
  danger: '#D48474',
  tabBar: '#121110',
  inputBg: '#1C1B19',
  checkboxFill: '#8FAF92',
  swipeTomorrow: '#6B8A6E',
  swipeArchive: '#6E6C68',
  sectionBg: '#1A1918',
  onAccent: '#121110',
  paperLine: '#302D28',
  actionEdit: '#7FA1C7',
  actionPin: '#D8A85B',
  actionRepeat: '#8FAF92',
  actionRead: '#A99BD0',
};

export const lightPalettes: Record<string, ThemeTokens> = {
  classic: lightTheme,
  yellow: {
    ...lightTheme,
    background: '#FFF5C9',
    card: '#FFF9DD',
    inputBg: '#FFFBE8',
    sectionBg: '#F6E7A7',
    border: '#E7D584',
    accent: '#7A6418',
    accentSoft: '#EFE3A9',
    checkboxFill: '#7A6418',
    paperLine: '#E2CE75',
  },
  pink: {
    ...lightTheme,
    background: '#FFE8EE',
    card: '#FFF5F7',
    inputBg: '#FFF8FA',
    sectionBg: '#F6D2DB',
    border: '#E8B9C7',
    accent: '#99506D',
    accentSoft: '#F0CBD7',
    checkboxFill: '#99506D',
    paperLine: '#E4B3C3',
  },
  mint: {
    ...lightTheme,
    background: '#E7F4E7',
    card: '#F5FFF5',
    inputBg: '#FAFFFA',
    sectionBg: '#D2E8D1',
    border: '#B7D2B6',
    accent: '#3F7547',
    accentSoft: '#D5EBD8',
    checkboxFill: '#3F7547',
    paperLine: '#B8D3B6',
  },
  sky: {
    ...lightTheme,
    background: '#E7F0FF',
    card: '#F5F9FF',
    inputBg: '#FAFCFF',
    sectionBg: '#D4E2F7',
    border: '#B9CCE8',
    accent: '#386D9E',
    accentSoft: '#D5E5F5',
    checkboxFill: '#386D9E',
    paperLine: '#B9CCE8',
  },
  graphite: {
    ...lightTheme,
    background: '#F2F2F0',
    card: '#FCFCFA',
    text: '#202020',
    mutedText: '#6A6A66',
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
    actionPin: '#8A7351',
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
