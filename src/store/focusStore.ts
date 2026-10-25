import { create } from 'zustand';

interface FocusState {
  selectedIds: string[];
  active: boolean;
  toggleSelect: (id: string) => void;
  clearSelection: () => void;
  startFocus: () => void;
  exitFocus: () => void;
}

export const MAX_FOCUS = 3;

export const useFocusStore = create<FocusState>((set, get) => ({
  selectedIds: [],
  active: false,
  toggleSelect: (id) => {
    const { selectedIds } = get();
    if (selectedIds.includes(id)) {
      set({ selectedIds: selectedIds.filter((x) => x !== id) });
      return;
    }
    if (selectedIds.length >= MAX_FOCUS) return;
    set({ selectedIds: [...selectedIds, id] });
  },
  clearSelection: () => set({ selectedIds: [], active: false }),
  startFocus: () => {
    if (get().selectedIds.length === 0) return;
    set({ active: true });
  },
  exitFocus: () => set({ active: false }),
}));
