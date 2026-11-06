import { create } from 'zustand';

export type ToastKind = 'error' | 'success' | 'info';
export type Toast = { id: number; message: string; kind: ToastKind };

type Store = {
  toast: Toast | null;
  show: (message: string, kind: ToastKind) => void;
  dismiss: (id: number) => void;
};

let nextId = 1;

export const useToastStore = create<Store>((set) => ({
  toast: null,
  show: (message, kind) => set({ toast: { id: nextId++, message, kind } }),
  // Only dismiss the toast that asked: a newer one that replaced it must stay.
  dismiss: (id) => set((s) => (s.toast?.id === id ? { toast: null } : s)),
}));

/**
 * A short, non-blocking message ("Could not save"). For problems the user can only acknowledge. Use
 * Alert.alert for decisions that need an answer (delete this?).
 */
export function showToast(message: string, kind: ToastKind = 'info') {
  useToastStore.getState().show(message, kind);
}
