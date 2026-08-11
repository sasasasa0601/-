-- =============================================================================
--  0001_init.sql の振る舞いを検証するスクリプト。
--
--  PostgREST が行うこと(ロールを anon にし、request.headers を設定すること)を
--  psql 上で再現している。ローカルの Postgres でそのまま実行できる:
--
--    createuser anon; createuser authenticated;
--    psql -v ON_ERROR_STOP=1 -f supabase/migrations/0001_init.sql
--    psql -v ON_ERROR_STOP=1 -f supabase/tests/rls_and_balance.sql
--
--  1 つでも期待と違えば ERROR で止まる。
-- =============================================================================

\set ON_ERROR_STOP on

-- 検証結果は RAISE NOTICE (stderr) で出す。
-- クエリ結果そのものは邪魔なので \o で捨てている。
create function pg_temp.expect(label text, ok boolean)
returns void
language plpgsql as $$
begin
  if ok then
    raise notice 'PASS  %', label;
  else
    raise exception 'FAIL  %', label;
  end if;
end;
$$;

\o /dev/null

-- 検証用に 2 つのルームを作る(片方は「他人のルーム」役)
insert into public.rooms (id, share_code, name, chip_rate) values
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaaaaaa', '自分のルーム', 10),
  ('22222222-2222-2222-2222-222222222222', 'bbbbbbbbbbbb', '他人のルーム', 0);

insert into public.sessions (id, room_id, played_at) values
  ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', now());

insert into public.session_players (session_id, name, seat_no, buy_in, cash_out) values
  ('33333333-3333-3333-3333-333333333333', 'あきら', 0, 1000, 1500),
  ('33333333-3333-3333-3333-333333333333', 'ひかる', 1, 1000,  900),
  ('33333333-3333-3333-3333-333333333333', 'かおる', 2, 1000,  600);

-- ------------------------------------------------------------------ RLS

-- 1. 正しいコードなら自分のルームが見える
begin;
  set local role anon;
  set local request.headers = '{"x-share-code":"aaaaaaaaaaaa"}';
  select pg_temp.expect('正しいコードで自分のルームが見える',
    (select count(*) from public.rooms) = 1);
  select pg_temp.expect('自分のルームの試合が見える',
    (select count(*) from public.sessions) = 1);
  select pg_temp.expect('自分の試合の参加者が見える',
    (select count(*) from public.session_players) = 3);
  select pg_temp.expect('通算成績ビューも同じ範囲しか見えない',
    (select count(*) from public.room_standings) = 0);  -- まだ確定していないので 0 件
commit;

-- 2. 他人のコードでは、こちらのデータが 1 行も見えない(列挙できない)
begin;
  set local role anon;
  set local request.headers = '{"x-share-code":"bbbbbbbbbbbb"}';
  select pg_temp.expect('他人のコードでは他人のルームだけが見える',
    (select coalesce(max(name), '') from public.rooms) = '他人のルーム');
  select pg_temp.expect('他人のコードではこちらの試合が見えない',
    (select count(*) from public.sessions) = 0);
  select pg_temp.expect('他人のコードではこちらの参加者が見えない',
    (select count(*) from public.session_players) = 0);
commit;

-- 3. ヘッダが無ければ何も見えない(Realtime など HTTP 文脈外での fail-closed)
begin;
  set local role anon;
  select pg_temp.expect('ヘッダ無しでは何も見えない',
    (select count(*) from public.rooms) = 0
    and (select count(*) from public.sessions) = 0
    and (select count(*) from public.session_players) = 0);
commit;

-- 4. 存在しないコードでも例外にならず、単に 0 件になる
begin;
  set local role anon;
  set local request.headers = '{"x-share-code":"zzzzzzzzzzzz"}';
  select pg_temp.expect('未知のコードは 0 件(エラーではない)',
    (select count(*) from public.rooms) = 0);
commit;

-- 5. 他人のルームには勝手に書き込めない
begin;
  set local role anon;
  set local request.headers = '{"x-share-code":"aaaaaaaaaaaa"}';
  do $$
  begin
    insert into public.sessions (room_id) values ('22222222-2222-2222-2222-222222222222');
    raise exception 'FAIL  他人のルームに試合を作れてしまった';
  exception when insufficient_privilege then
    raise notice 'PASS  他人のルームには書き込めない';
  end;
  $$;
rollback;

-- ------------------------------------------------------------- 計算と確定

-- 6. 増減が生成列として自動計算される
select pg_temp.expect('増減 = 最終 - 初期 が自動計算される',
  (select net from public.session_players where name = 'あきら') = 500
  and (select net from public.session_players where name = 'かおる') = -400);

select pg_temp.expect('増減の合計はゼロ',
  (select sum(net) from public.session_players
    where session_id = '33333333-3333-3333-3333-333333333333') = 0);

-- 7. 合計が合わない試合は確定できない
begin;
  update public.session_players set cash_out = 700 where name = 'かおる';  -- 差分 +100
  do $$
  begin
    update public.sessions set status = 'closed'
      where id = '33333333-3333-3333-3333-333333333333';
    raise exception 'FAIL  ズレたまま確定できてしまった';
  exception when check_violation then
    raise notice 'PASS  合計が合わない試合は確定できない';
  end;
  $$;
rollback;

-- 8. 最終チップが未入力の人がいると確定できない
begin;
  update public.session_players set cash_out = null where name = 'かおる';
  do $$
  begin
    update public.sessions set status = 'closed'
      where id = '33333333-3333-3333-3333-333333333333';
    raise exception 'FAIL  未入力のまま確定できてしまった';
  exception when check_violation then
    raise notice 'PASS  未入力があると確定できない';
  end;
  $$;
rollback;

-- 9. プラマイゼロなら確定できる
update public.sessions set status = 'closed'
  where id = '33333333-3333-3333-3333-333333333333';
select pg_temp.expect('プラマイゼロなら確定できる',
  (select status from public.sessions
    where id = '33333333-3333-3333-3333-333333333333') = 'closed');

-- 10. 確定済みの結果は書き換えられない
do $$
begin
  update public.session_players set cash_out = 9999 where name = 'あきら';
  raise exception 'FAIL  確定済みの結果を書き換えられてしまった';
exception when check_violation then
  raise notice 'PASS  確定済みの結果は書き換えられない';
end;
$$;

select pg_temp.expect('書き換えは実際に反映されていない',
  (select cash_out from public.session_players where name = 'あきら') = 1500);

-- 11. 確定後は通算成績に載る
begin;
  set local role anon;
  set local request.headers = '{"x-share-code":"aaaaaaaaaaaa"}';
  select pg_temp.expect('通算成績が集計される',
    (select total_net from public.room_standings where name = 'あきら') = 500
    and (select games from public.room_standings where name = 'ひかる') = 1
    and (select wins from public.room_standings where name = 'かおる') = 0);
commit;

-- 12. 確定済みでも「試合ごと削除」はできる
--     (子への cascade delete が編集ガードに阻まれないことの確認)
begin;
  delete from public.sessions where id = '33333333-3333-3333-3333-333333333333';
  select pg_temp.expect('確定済みの試合も削除できる',
    (select count(*) from public.sessions) = 0
    and (select count(*) from public.session_players) = 0);
rollback;

-- 13. 再編集に戻せば、また書き換えられる
update public.sessions set status = 'open'
  where id = '33333333-3333-3333-3333-333333333333';
update public.session_players set cash_out = 1400 where name = 'あきら';
select pg_temp.expect('再編集にすれば書き換えられる',
  (select cash_out from public.session_players where name = 'あきら') = 1400);

-- 14. 未確定なら参加者を外せる
begin;
  delete from public.session_players where name = 'かおる';
  select pg_temp.expect('未確定なら参加者を削除できる',
    (select count(*) from public.session_players) = 2);
rollback;

-- 15. ルームを消すと関連データも消える
delete from public.rooms where share_code = 'aaaaaaaaaaaa';
select pg_temp.expect('ルーム削除で試合も参加者も消える',
  (select count(*) from public.sessions) = 0
  and (select count(*) from public.session_players) = 0);

delete from public.rooms where share_code = 'bbbbbbbbbbbb';

\o
\warn ''
\warn '=== すべての検証をパスしました ==='
