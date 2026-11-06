// Shapes returned by the API (server/src/routes/challenges.ts).
import type { PersonCard } from '@/features/friends/types';

export type ChallengeType = 'distance' | 'run_count' | 'kcal_streak';
export type ChallengeStatus = 'draft' | 'active' | 'ended';

/** A challenge in my list. Only MY score and rank are included; the full board is in the detail. */
export type ChallengeSummary = {
  id: string;
  title: string;
  type: ChallengeType;
  /** Metres for distance, runs for run_count, days for kcal_streak. */
  target_value: number;
  starts_at: string;
  ends_at: string;
  status: ChallengeStatus;
  my_status: 'invited' | 'joined';
  creator: PersonCard | null;
  member_count: number | null;
  my_value: number | null;
  my_rank: number | null;
};

export type LeaderboardEntry = {
  rank: number;
  user: PersonCard;
  value: number;
  reached_at: string;
};

export type ChallengeDetail = {
  id: string;
  title: string;
  type: ChallengeType;
  target_value: number;
  starts_at: string;
  ends_at: string;
  status: ChallengeStatus;
  my_status: 'invited' | 'joined';
  is_creator: boolean;
  creator: PersonCard | null;
  member_count: number;
  /** Empty until I have joined. */
  leaderboard: LeaderboardEntry[];
  my_rank: number | null;
  my_value: number | null;
  winner: { user: PersonCard; value: number } | null;
};
