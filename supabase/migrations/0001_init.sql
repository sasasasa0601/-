-- =============================================================================
--  ポーカー チップ増減計算・記録アプリ  初期スキーマ
--  Supabase (PostgreSQL) 用マイグレーション
--
--  セキュリティモデル: "Capability URL"
--    - ルームごとに推測不可能な share_code を持つ
--    - クライアントは HTTP ヘッダ x-share-code に自分のコードを付けてアクセスする
--    - RLS がそのヘッダと行の share_code を突き合わせる
--    => URL(コード)を知っている人だけが読み書きできる。ログイン不要。
--       anon キーを持っていても、コードを知らない他人のルームは 1 行も見えない。
-- =============================================================================

create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- 1. テーブル
-- -----------------------------------------------------------------------------

-- ルーム(グループ) : 「いつメン」の単位。この URL を共有する。
create table if not exists public.rooms (
  id          uuid        primary key default gen_random_uuid(),
  share_code  text        not null unique
                          check (share_code ~ '^[0-9a-z]{8,32}$'),
  name        text        not null default 'ポーカー部'
                          check (char_length(name) between 1 and 60),
  -- 1 チップあたりの金額(円)。0 なら金額換算を表示しない。
  chip_rate   numeric(12,2) not null default 0 check (chip_rate >= 0),
  created_at  timestamptz not null default now()
);

-- ルームの常連プレイヤー名簿。試合ごとにワンタップで呼び出せるようにする。
create table if not exists public.players (
  id          uuid        primary key default gen_random_uuid(),
  room_id     uuid        not null references public.rooms(id) on delete cascade,
  name        text        not null check (char_length(name) between 1 and 30),
  created_at  timestamptz not null default now(),
  unique (room_id, name)
);

-- 試合(セッション) : 1 回のポーカー。
create table if not exists public.sessions (
  id          uuid        primary key default gen_random_uuid(),
  room_id     uuid        not null references public.rooms(id) on delete cascade,
  title       text        not null default '' check (char_length(title) <= 60),
  played_at   timestamptz not null default now(),   -- 試合の日付と時間
  status      text        not null default 'open' check (status in ('open', 'closed')),
  note        text        not null default '' check (char_length(note) <= 500),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- 試合の参加者とチップ。
-- name は「スナップショット」。後で名簿の名前を変えても過去の履歴は変わらない。
create table if not exists public.session_players (
  id          uuid        primary key default gen_random_uuid(),
  session_id  uuid        not null references public.sessions(id) on delete cascade,
  player_id   uuid        references public.players(id) on delete set null,
  name        text        not null default '' check (char_length(name) <= 30),
  seat_no     integer     not null default 0,
  buy_in      integer     not null default 0 check (buy_in >= 0),  -- 初期チップ(リバイ込み)
  cash_out    integer     check (cash_out >= 0),                   -- 終了時チップ(null = 未入力)
  -- 増減 = 最終 - 初期。未入力のうちは null のまま。
  net         integer     generated always as (cash_out - buy_in) stored,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists sessions_room_played_idx
  on public.sessions (room_id, played_at desc);
create index if not exists session_players_session_idx
  on public.session_players (session_id, seat_no);
create index if not exists players_room_idx
  on public.players (room_id);

-- -----------------------------------------------------------------------------
-- 2. updated_at 自動更新
-- -----------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists sessions_touch on public.sessions;
create trigger sessions_touch before update on public.sessions
  for each row execute function public.touch_updated_at();

drop trigger if exists session_players_touch on public.session_players;
create trigger session_players_touch before update on public.session_players
  for each row execute function public.touch_updated_at();

-- -----------------------------------------------------------------------------
-- 3. 「プラマイゼロ」の保証
--    試合を closed にするときだけ、参加者全員の増減合計が 0 であることを強制する。
--    (open の間は入力途中なのでズレていて良い)
-- -----------------------------------------------------------------------------
create or replace function public.assert_session_balanced()
returns trigger
language plpgsql
as $$
declare
  v_diff integer;
  v_missing integer;
begin
  if new.status <> 'closed' or (tg_op = 'UPDATE' and old.status = 'closed') then
    return new;
  end if;

  select count(*) filter (where cash_out is null),
         coalesce(sum(coalesce(cash_out, 0)), 0) - coalesce(sum(buy_in), 0)
    into v_missing, v_diff
    from public.session_players
   where session_id = new.id;

  if v_missing > 0 then
    raise exception '最終チップが未入力のプレイヤーが % 人います', v_missing
      using errcode = 'check_violation';
  end if;

  if v_diff <> 0 then
    raise exception 'チップ合計が一致しません (差分: %)', v_diff
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists sessions_assert_balanced on public.sessions;
create trigger sessions_assert_balanced before insert or update on public.sessions
  for each row execute function public.assert_session_balanced();

-- 確定済みの試合は結果を書き換えられないようにする(履歴の信頼性)
create or replace function public.block_closed_session_edit()
returns trigger
language plpgsql
as $$
declare
  v_status text;
begin
  select status into v_status
    from public.sessions
   where id = coalesce(new.session_id, old.session_id);

  if v_status = 'closed' then
    raise exception '確定済みの試合は編集できません。先に「再編集」してください'
      using errcode = 'check_violation';
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists session_players_guard on public.session_players;
create trigger session_players_guard before insert or update or delete on public.session_players
  for each row execute function public.block_closed_session_edit();

-- -----------------------------------------------------------------------------
-- 4. 通算成績ビュー
-- -----------------------------------------------------------------------------
create or replace view public.room_standings
with (security_invoker = on) as
  select s.room_id,
         sp.name,
         count(*)::int              as games,
         sum(sp.net)::int           as total_net,
         count(*) filter (where sp.net > 0)::int as wins,
         max(s.played_at)           as last_played_at
    from public.session_players sp
    join public.sessions s on s.id = sp.session_id
   where s.status = 'closed' and sp.net is not null
   group by s.room_id, sp.name;

-- -----------------------------------------------------------------------------
-- 5. RLS
-- -----------------------------------------------------------------------------

-- リクエストヘッダから share_code を取り出す。
-- Realtime など HTTP ヘッダが無い文脈では null になり、ポリシーは fail-closed になる。
--
-- 内側の nullif が重要: GUC が未設定なら current_setting は null を返すが、
-- 一度設定されたあとリセットされた場合は空文字が返ることがある。
-- 空文字をそのまま ::json に渡すと例外になり、「見えない」ではなく
-- 「エラー」になってしまうため、先に null へ畳んでおく。
create or replace function public.request_share_code()
returns text
language sql
stable
as $$
  select nullif(
    nullif(current_setting('request.headers', true), '')::json ->> 'x-share-code',
    ''
  );
$$;

-- rooms 自身の RLS を再帰させないため security definer で参照する。
create or replace function public.can_access_room(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.rooms r
     where r.id = p_room_id
       and r.share_code = public.request_share_code()
  );
$$;

create or replace function public.can_access_session(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.sessions s
      join public.rooms r on r.id = s.room_id
     where s.id = p_session_id
       and r.share_code = public.request_share_code()
  );
$$;

alter table public.rooms            enable row level security;
alter table public.players          enable row level security;
alter table public.sessions         enable row level security;
alter table public.session_players  enable row level security;

drop policy if exists rooms_rw on public.rooms;
create policy rooms_rw on public.rooms
  for all to anon, authenticated
  using      (share_code = public.request_share_code())
  with check (share_code = public.request_share_code());

drop policy if exists players_rw on public.players;
create policy players_rw on public.players
  for all to anon, authenticated
  using      (public.can_access_room(room_id))
  with check (public.can_access_room(room_id));

drop policy if exists sessions_rw on public.sessions;
create policy sessions_rw on public.sessions
  for all to anon, authenticated
  using      (public.can_access_room(room_id))
  with check (public.can_access_room(room_id));

drop policy if exists session_players_rw on public.session_players;
create policy session_players_rw on public.session_players
  for all to anon, authenticated
  using      (public.can_access_session(session_id))
  with check (public.can_access_session(session_id));

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete
  on public.rooms, public.players, public.sessions, public.session_players
  to anon, authenticated;
grant select on public.room_standings to anon, authenticated;
grant execute on function public.request_share_code()      to anon, authenticated;
grant execute on function public.can_access_room(uuid)     to anon, authenticated;
grant execute on function public.can_access_session(uuid)  to anon, authenticated;
