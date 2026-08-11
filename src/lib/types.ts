export type SessionStatus = "open" | "closed";

export type Room = {
  id: string;
  share_code: string;
  name: string;
  chip_rate: number;
  created_at: string;
};

/** ルームの常連名簿 */
export type Player = {
  id: string;
  room_id: string;
  name: string;
  created_at: string;
};

/** 1 試合 */
export type GameSession = {
  id: string;
  room_id: string;
  title: string;
  played_at: string;
  status: SessionStatus;
  note: string;
  created_at: string;
  updated_at: string;
};

/** 試合の参加者 1 人分のチップ */
export type SessionPlayer = {
  id: string;
  session_id: string;
  player_id: string | null;
  name: string;
  seat_no: number;
  buy_in: number;
  /** 未入力なら null */
  cash_out: number | null;
  /** DB の生成列: cash_out - buy_in (未入力なら null) */
  net: number | null;
  created_at: string;
  updated_at: string;
};

export type SessionWithPlayers = GameSession & {
  session_players: SessionPlayer[];
};

export type Standing = {
  room_id: string;
  name: string;
  games: number;
  total_net: number;
  wins: number;
  last_played_at: string;
};
