import { useQuery } from '@tanstack/react-query';

import { useAuth } from './AuthProvider';
import type { Profile } from './types';
import { apiFetch } from '@/lib/api';

export const profileKey = (userId: string | undefined) => ['profile', userId] as const;

export function useProfile() {
  const { session } = useAuth();
  const userId = session?.user.id;
  return useQuery({
    queryKey: profileKey(userId),
    enabled: !!userId,
    queryFn: () => apiFetch<Profile>('/me/profile'),
  });
}
