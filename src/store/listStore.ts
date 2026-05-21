import { create } from 'zustand';

import { INBOX_LIST_ID } from '@/db/constants';
import { listRepository } from '@/features/lists/listRepository';
import { useSettingsStore } from '@/store/settingsStore';
import { useTaskStore } from '@/store/taskStore';
import type { TaskList } from '@/types/list';

interface ListState {
  lists: TaskList[];
  refresh: () => Promise<void>;
  createList: (name: string) => Promise<TaskList>;
  renameList: (id: string, name: string) => Promise<void>;
  setListColor: (id: string, color: string) => Promise<void>;
  deleteList: (id: string) => Promise<void>;
}

export const useListStore = create<ListState>((set) => ({
  lists: [],
  refresh: async () => {
    const lists = await listRepository.getAll();
    set({ lists });
  },
  createList: async (name) => {
    const list = await listRepository.create(name);
    const lists = await listRepository.getAll();
    set({ lists });
    return list;
  },
  renameList: async (id, name) => {
    await listRepository.rename(id, name);
    const lists = await listRepository.getAll();
    set({ lists });
  },
  setListColor: async (id, color) => {
    await listRepository.updateColor(id, color);
    const lists = await listRepository.getAll();
    set({ lists });
  },
  deleteList: async (id) => {
    await listRepository.delete(id);
    if (useSettingsStore.getState().settings.defaultListId === id) {
      await useSettingsStore.getState().setSetting('defaultListId', INBOX_LIST_ID);
    }
    const lists = await listRepository.getAll();
    set({ lists });
    await useTaskStore.getState().refreshAll();
  },
}));
