import { create } from 'zustand';

// An invite link opened while signed out (or before onboarding) cannot be acted on yet. The username is
// remembered here and the invite screen opens once the user is fully signed in.
type Store = { username: string | null; set: (username: string) => void; clear: () => void };

export const usePendingInvite = create<Store>((set) => ({
  username: null,
  set: (username) => set({ username }),
  clear: () => set({ username: null }),
}));
