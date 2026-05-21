/** Fixed task color palette — thin row markers, not full-row fills. */
export const TASK_COLORS = [
  { key: 'red', value: '#C45C5C', label: 'Red' },
  { key: 'terracotta', value: '#B85C4A', label: 'Terracotta' },
  { key: 'yellow', value: '#C4A035', label: 'Yellow' },
  { key: 'green', value: '#4F6B52', label: 'Green' },
  { key: 'mint', value: '#5A9E8F', label: 'Mint' },
  { key: 'cyan', value: '#356C8C', label: 'Cyan' },
  { key: 'blue', value: '#4F8EEB', label: 'Blue' },
  { key: 'purple', value: '#8A5D8F', label: 'Purple' },
  { key: 'gray', value: '#8A8F94', label: 'Gray' },
  { key: 'dark', value: '#2F3638', label: 'Dark' },
] as const;

export const TASK_COLOR_VALUES = TASK_COLORS.map((c) => c.value);
