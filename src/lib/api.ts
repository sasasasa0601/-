import { getRoomClient } from "./supabase";
import { generateShareCode } from "./shareCode";
import type {
  GameSession,
  Player,
  Room,
  SessionPlayer,
  SessionWithPlayers,
  Standing,
} from "./types";

/** Supabase のエラーを、ユーザーに見せられる Error に変換する */
function unwrap<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  if (res.data === null) throw new Error("データが見つかりませんでした");
  return res.data;
}

// ---------------------------------------------------------------- ルーム

export async function createRoom(name: string): Promise<Room> {
  const shareCode = generateShareCode();
  const client = getRoomClient(shareCode);

  return unwrap(
    await client
      .from("rooms")
      .insert({ share_code: shareCode, name: name.trim() || "ポーカー部" })
      .select()
      .single(),
  );
}

export async function getRoom(shareCode: string): Promise<Room | null> {
  const { data, error } = await getRoomClient(shareCode)
    .from("rooms")
    .select("*")
    .eq("share_code", shareCode)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}

export async function updateRoom(
  shareCode: string,
  patch: Partial<Pick<Room, "name" | "chip_rate">>,
): Promise<Room> {
  return unwrap(
    await getRoomClient(shareCode)
      .from("rooms")
      .update(patch)
      .eq("share_code", shareCode)
      .select()
      .single(),
  );
}

// ---------------------------------------------------------------- 名簿

export async function listPlayers(shareCode: string, roomId: string): Promise<Player[]> {
  return unwrap(
    await getRoomClient(shareCode)
      .from("players")
      .select("*")
      .eq("room_id", roomId)
      .order("created_at", { ascending: true }),
  );
}

/** 同名がいれば既存を返し、いなければ登録する */
export async function ensurePlayer(
  shareCode: string,
  roomId: string,
  name: string,
): Promise<Player> {
  return unwrap(
    await getRoomClient(shareCode)
      .from("players")
      .upsert({ room_id: roomId, name: name.trim() }, { onConflict: "room_id,name" })
      .select()
      .single(),
  );
}

// ---------------------------------------------------------------- 試合

const SESSION_SELECT = "*, session_players(*)";

export async function listSessions(
  shareCode: string,
  roomId: string,
): Promise<SessionWithPlayers[]> {
  const rows = unwrap<SessionWithPlayers[]>(
    await getRoomClient(shareCode)
      .from("sessions")
      .select(SESSION_SELECT)
      .eq("room_id", roomId)
      .order("played_at", { ascending: false }),
  );

  for (const row of rows) {
    row.session_players.sort((a, b) => a.seat_no - b.seat_no);
  }
  return rows;
}

export async function getSession(
  shareCode: string,
  sessionId: string,
): Promise<SessionWithPlayers | null> {
  const { data, error } = await getRoomClient(shareCode)
    .from("sessions")
    .select(SESSION_SELECT)
    .eq("id", sessionId)
    .maybeSingle<SessionWithPlayers>();

  if (error) throw new Error(error.message);
  if (data) data.session_players.sort((a, b) => a.seat_no - b.seat_no);
  return data;
}

export async function createSession(
  shareCode: string,
  roomId: string,
  options: { title?: string; playedAt?: Date; defaultBuyIn?: number; names?: string[] } = {},
): Promise<GameSession> {
  const client = getRoomClient(shareCode);

  const session = unwrap<GameSession>(
    await client
      .from("sessions")
      .insert({
        room_id: roomId,
        title: options.title ?? "",
        played_at: (options.playedAt ?? new Date()).toISOString(),
      })
      .select()
      .single(),
  );

  const names = options.names ?? [];
  if (names.length > 0) {
    const rows = names.map((name, index) => ({
      session_id: session.id,
      name,
      seat_no: index,
      buy_in: options.defaultBuyIn ?? 0,
    }));
    const { error } = await client.from("session_players").insert(rows);
    if (error) throw new Error(error.message);
  }

  return session;
}

export async function updateSession(
  shareCode: string,
  sessionId: string,
  patch: Partial<Pick<GameSession, "title" | "played_at" | "note" | "status">>,
): Promise<GameSession> {
  return unwrap(
    await getRoomClient(shareCode)
      .from("sessions")
      .update(patch)
      .eq("id", sessionId)
      .select()
      .single(),
  );
}

export async function deleteSession(shareCode: string, sessionId: string): Promise<void> {
  const { error } = await getRoomClient(shareCode)
    .from("sessions")
    .delete()
    .eq("id", sessionId);
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------- 参加者

export async function addSessionPlayer(
  shareCode: string,
  sessionId: string,
  input: { name?: string; seatNo: number; buyIn?: number; playerId?: string | null },
): Promise<SessionPlayer> {
  return unwrap(
    await getRoomClient(shareCode)
      .from("session_players")
      .insert({
        session_id: sessionId,
        player_id: input.playerId ?? null,
        name: input.name ?? "",
        seat_no: input.seatNo,
        buy_in: input.buyIn ?? 0,
      })
      .select()
      .single(),
  );
}

export async function updateSessionPlayer(
  shareCode: string,
  id: string,
  patch: Partial<Pick<SessionPlayer, "name" | "buy_in" | "cash_out" | "seat_no" | "player_id">>,
): Promise<SessionPlayer> {
  return unwrap(
    await getRoomClient(shareCode)
      .from("session_players")
      .update(patch)
      .eq("id", id)
      .select()
      .single(),
  );
}

export async function removeSessionPlayer(shareCode: string, id: string): Promise<void> {
  const { error } = await getRoomClient(shareCode)
    .from("session_players")
    .delete()
    .eq("id", id);
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------- 通算成績

export async function getStandings(
  shareCode: string,
  roomId: string,
): Promise<Standing[]> {
  return unwrap(
    await getRoomClient(shareCode)
      .from("room_standings")
      .select("*")
      .eq("room_id", roomId)
      .order("total_net", { ascending: false }),
  );
}

// ---------------------------------------------------------------- 画面単位のまとめ読み

export type RoomView = {
  room: Room | null;
  sessions: SessionWithPlayers[];
  standings: Standing[];
};

/** ルーム画面が必要とするものを 1 回で揃える */
export async function loadRoomView(shareCode: string): Promise<RoomView> {
  const room = await getRoom(shareCode);
  if (!room) return { room: null, sessions: [], standings: [] };

  const [sessions, standings] = await Promise.all([
    listSessions(shareCode, room.id),
    getStandings(shareCode, room.id),
  ]);

  return { room, sessions, standings };
}

export type SessionView = {
  room: Room | null;
  session: GameSession | null;
  players: SessionPlayer[];
  /** ルームの名簿(入力候補として使う) */
  roster: string[];
};

/** 試合画面が必要とするものを 1 回で揃える */
export async function loadSessionView(
  shareCode: string,
  sessionId: string,
): Promise<SessionView> {
  const [room, sessionWithPlayers] = await Promise.all([
    getRoom(shareCode),
    getSession(shareCode, sessionId),
  ]);

  const roster = room ? (await listPlayers(shareCode, room.id)).map((p) => p.name) : [];

  if (!sessionWithPlayers) {
    return { room, session: null, players: [], roster };
  }

  const { session_players: players, ...session } = sessionWithPlayers;
  return { room, session, players, roster };
}
