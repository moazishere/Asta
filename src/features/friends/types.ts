// Shapes returned by the API (server/src/routes/friends.ts).

/** What the app may know about another person: never email, weight, height or goals. */
export type PersonCard = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
};

export type FriendEntry = {
  friendship_id: string;
  user: PersonCard;
  since: string;
  week_distance_m: number;
  week_runs: number;
};

export type RequestEntry = { friendship_id: string; user: PersonCard; created_at: string };

export type FriendsOverview = {
  friends: FriendEntry[];
  incoming: RequestEntry[];
  outgoing: RequestEntry[];
  blocked: { friendship_id: string; user: PersonCard }[];
};

export type Relationship = 'none' | 'friends' | 'outgoing' | 'incoming' | 'blocked';

export type LookupResult = {
  user: PersonCard;
  relationship: Relationship;
  friendship_id: string | null;
};

/** A friend's run as friends see it: only the trimmed public route, no calories or GPS points. */
export type FriendRun = {
  id: string;
  started_at: string;
  ended_at: string;
  distance_m: number;
  moving_time_s: number;
  avg_pace_s_per_km: number | null;
  route_polyline_public: string | null;
};

export type FriendProfile = {
  user: PersonCard;
  friendship_id: string;
  since: string;
  week_distance_m: number;
  week_runs: number;
  runs: FriendRun[];
};
