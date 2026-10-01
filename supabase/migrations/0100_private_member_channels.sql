-- Every Realtime channel the app opens is private, so the project's "Allow public access to
-- channels" setting can be switched off: with it on, anyone holding the publishable key can open
-- as many public channels as they like and spend the project's message quota.
--
-- A private channel joins only when a realtime.messages SELECT policy lets the member read its
-- topic. Realtime checks that at join for Broadcast and Presence alone, and refuses the join when
-- neither is readable, so a channel that carries only Postgres Changes still needs a Broadcast
-- read policy on its topic. The changes themselves are filtered by each table's RLS as before.
--
-- 0092's policy covers the live:* topics. The member's own Postgres Changes channels (their base
-- profile channel and each page's row-filtered channel) are live-member:<their id>:base:<n> and
-- live-member:<their id>:page:<n>, and only that member, while invited, may join them. No insert
-- policy, so nobody can broadcast into them.
--
-- Additive: the app still serving while this applies opens public channels, which keep working
-- until the setting is switched off.

begin;

create policy member_topics_receive on realtime.messages for select to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and (select realtime.topic()) ~ ('^live-member:' || (select auth.uid())::text || ':(base|page):[0-9]+$')
    and (select public.is_invited())
  );

commit;
