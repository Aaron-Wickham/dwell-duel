// Adds about 10× today's data to the LOCAL database, for measuring query plans at the scale the
// data-layer spec targets (docs/archive/superpowers/specs/2026-09-26-data-layer-scale-design.md):
// 500 members, 200 markets, 20,000 bets with their ledger rows, resolutions and their payouts,
// overrides, voids, parlays and task completions. Markets are priced by the market maker
// (pricing = 'lmsr') and every bet and parlay goes through place_slip_v4 as its member, so the
// seed is data the app itself would make (#373); the unsettled markets stay open for betting.
// Development only: it refuses any database that
// isn't local, and CI never runs it. It only adds rows, tagged per run so it can run again;
// `npm run db:reset` clears everything, and the DB test suite needs one afterwards.
// Run it by hand: `node scripts/seed-scale.mjs`.
import { config } from 'dotenv'

config({ path: '.env.local', quiet: true })

const MEMBERS = 500
const MARKETS = 200
const BETS = 20_000
const PARLAYS = 400
const RESOLVED = 120
const OVERRIDDEN = 10
const VOIDED = 10
const TASKS = 20
const COMPLETIONS = 3_000

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost'])

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SECRET_KEY
if (!url || !key) throw new Error('Missing Supabase env vars — is .env.local present?')
const host = new URL(url).hostname
if (!LOCAL_HOSTS.has(host)) {
  console.error(`Refusing to seed ${host}: this script only writes to a local Supabase (${[...LOCAL_HOSTS].join(' or ')}).`)
  process.exit(1)
}

// Letters and digits only, so it is safe inside the SQL below.
const tag = Date.now().toString(36)
const memberEmails = `'scale-${tag}-%'`
const seedNote = `'Scale seed ${tag}'`
const adminEmail = `'scale-${tag}-1@example.test'`

// postgres-meta, the /pg route Supabase Studio uses: it runs a multi-statement query as one
// implicit transaction, with a 55-second limit, so each step is its own call.
async function run(step, sql) {
  const started = Date.now()
  const res = await fetch(`${url}/pg/query`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  })
  const body = await res.json()
  if (!res.ok) throw new Error(`${step} failed: ${body.message ?? JSON.stringify(body)}`)
  console.log(`${step} (${((Date.now() - started) / 1000).toFixed(1)}s)`)
  return body
}

// Numbered by email, not id: id is a fresh random uuid every run, so ordering by it would make
// rn (and everything random() picks by rn) different each time even with the same seed. email's
// numeric suffix is assigned in insertion order, so ordering by it is the same permutation on
// every run.
const scaleTempTables = `
  create temp table scale_members on commit drop as
    select id, email, row_number() over (order by email) as rn from public.profiles where email like ${memberEmails};
  create temp table scale_markets on commit drop as
    select id, created_at, row_number() over (order by created_at, id) as rn from public.markets where description = ${seedNote};
`

// Rows written straight into coin_transactions bypass apply_coin_transaction, so the balances
// are re-derived from the ledger, which is the invariant the app keeps.
const syncBalances = `
  update public.profiles p set balance = s.total
  from (select profile_id, sum(amount)::integer as total from public.coin_transactions group by profile_id) s
  where p.id = s.profile_id and p.email like ${memberEmails};
`

await run(
  `Members (${MEMBERS})`,
  `
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  )
  select '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
    format('scale-%s-%s@example.test', '${tag}', n), '', now(),
    '', '', '', '',
    '{"provider":"email","providers":["email"]}', '{}', now(), now()
  from generate_series(1, ${MEMBERS}) n;

  -- on_profile_created grants each one the 100 DC starting grant.
  insert into public.profiles (id, email, display_name, role)
  select id, email, 'Scale member ' || split_part(split_part(email, '@', 1), '-', 3),
    case when email = ${adminEmail} then 'admin' else 'member' end
  from auth.users where email like ${memberEmails};

  insert into public.allowed_emails (email, claimed_by)
  select email, id from public.profiles where email like ${memberEmails};

  insert into public.coin_transactions (profile_id, amount, type, meta)
  select id, 5000, 'admin_adjustment', jsonb_build_object('reason', 'Scale seed')
  from public.profiles where email like ${memberEmails};

  ${syncBalances}
  `,
)

await run(
  `Markets (${MARKETS})`,
  `
  ${scaleTempTables}
  insert into public.markets (created_by, title, description, kind, close_at, created_at, pricing, seed_per_outcome)
  select m.id, format('Scale market %s', n), ${seedNote},
    case when n % 4 = 0 then 'multiple_choice' else 'binary' end,
    now() + interval '30 days', now() - (${MARKETS} + 1 - n) * interval '12 hours', 'lmsr', 0
  from generate_series(1, ${MARKETS}) n
  join scale_members m on m.rn = 1 + (n * 37) % ${MEMBERS};

  insert into public.market_outcomes (market_id, label)
  select m.id, l.label
  from public.markets m
  cross join lateral unnest(
    case m.kind when 'binary' then array['Yes', 'No'] else array['Red', 'Blue', 'Green'] end
  ) as l(label)
  where m.description = ${seedNote};
  `,
)

// Bets go through place_slip_v4 as their members, a chunk per call so none nears postgres-meta's
// time limit. The shown payout is the stake, which a market-maker bet always pays at least, so
// the 2% re-price check never refuses one.
const BET_CHUNK = 2_500
for (let first = 1; first <= BETS; first += BET_CHUNK) {
  const last = Math.min(first + BET_CHUNK - 1, BETS)
  await run(
    `Bets ${first}–${last} of ${BETS}`,
    `
    select setseed(${(0.42 + first / (10 * BETS)).toFixed(6)});
    ${scaleTempTables}
    do $$
    declare
      v_bet record;
    begin
      for v_bet in
        select p.id as profile_id, p.email, o.id as outcome_id, r.amount
        from (
          select 1 + floor(random() * ${MARKETS})::integer as market_rn,
            random() as pick,
            1 + floor(random() * ${MEMBERS})::integer as member_rn,
            1 + floor(random() * 20)::integer as amount
          from generate_series(${first}, ${last})
        ) r
        join scale_markets m on m.rn = r.market_rn
        join scale_members p on p.rn = r.member_rn
        join lateral (
          select o.id from public.market_outcomes o
          where o.market_id = m.id
          order by o.label
          offset floor(r.pick * (select count(*) from public.market_outcomes c where c.market_id = m.id))::integer
          limit 1
        ) o on true
      loop
        perform set_config(
          'request.jwt.claims',
          json_build_object('sub', v_bet.profile_id, 'email', v_bet.email, 'role', 'authenticated')::text,
          true
        );
        perform public.place_slip_v4(
          jsonb_build_array(jsonb_build_object('outcome_id', v_bet.outcome_id, 'amount', v_bet.amount, 'payout', v_bet.amount)),
          null, null, null, null
        );
      end loop;
    end
    $$;
    `,
  )
}

// Every bet was placed just now. Spread each market's bets evenly over its life, keeping the order
// they were placed in (bet ids rise with it), so the chance history the charts read from them is
// the order the market maker priced them in. A bet's ledger row is the same rank among its
// market's bet_placed rows, since each was written beside its bet.
await run(
  'Bet times spread over each market\'s life',
  `
  ${scaleTempTables}
  create temp table scale_bet_times on commit drop as
    select b.id, b.market_id,
      row_number() over (partition by b.market_id order by b.id) as rank,
      m.created_at + (row_number() over (partition by b.market_id order by b.id) - 0.5)
        / count(*) over (partition by b.market_id) * (now() - interval '1 minute' - m.created_at) as at
    from public.bets b
    join scale_markets m on m.id = b.market_id;

  update public.bets b set created_at = x.at from scale_bet_times x where b.id = x.id;

  with ranked as (
    select t.id, (t.meta ->> 'market_id')::uuid as market_id,
      row_number() over (partition by t.meta ->> 'market_id' order by t.id) as rank
    from public.coin_transactions t
    where t.type = 'bet_placed' and (t.meta ->> 'market_id')::uuid in (select id from scale_markets)
  )
  update public.coin_transactions t set created_at = x.at
  from ranked r
  join scale_bet_times x on x.market_id = r.market_id and x.rank = r.rank
  where t.id = r.id;
  `,
)

// Parlays, resolutions and voids go through the real functions, acting as a member through the
// same JWT claims PostgREST sets, so every payout, reversal and settlement is the app's own.
await run(
  `Parlays (up to ${PARLAYS})`,
  `
  select setseed(0.42);
  do $$
  declare
    v_member record;
    v_outcomes uuid[];
  begin
    for i in 1..${PARLAYS} loop
      select id, email into v_member from public.profiles
      where email = format('scale-%s-%s@example.test', '${tag}', 1 + (i * 53) % ${MEMBERS});
      perform set_config(
        'request.jwt.claims',
        json_build_object('sub', v_member.id, 'email', v_member.email, 'role', 'authenticated')::text,
        true
      );

      select array_agg(pick) into v_outcomes
      from (
        select (
          select o.id from public.market_outcomes o
          where o.market_id = m.id and o.pool_total > 0
          order by random() limit 1
        ) as pick
        from public.markets m
        where m.description = ${seedNote}
        order by random()
        limit 2 + i % 2
      ) picks
      where pick is not null;

      -- The shown payout is the stake: a parlay's multiplier is at least 1.00×.
      if coalesce(array_length(v_outcomes, 1), 0) >= 2 then
        perform public.place_slip_v4('[]'::jsonb, v_outcomes, 1 + i % 10, 1 + i % 10, null);
      end if;
    end loop;
  end
  $$;

  -- Spread them out in time; they were all placed in this transaction.
  update public.parlays set created_at = now() - random() * interval '60 days'
  where profile_id in (select id from public.profiles where email like ${memberEmails});

  update public.coin_transactions t set created_at = pa.created_at
  from public.parlays pa
  where t.type = 'parlay_placed' and (t.meta ->> 'parlay_id')::uuid = pa.id
    and pa.profile_id in (select id from public.profiles where email like ${memberEmails});
  `,
)

await run(
  `Resolutions (${RESOLVED}, ${OVERRIDDEN} of them overridden) and voids (${VOIDED})`,
  `
  select setseed(0.42);
  do $$
  declare
    v_admin record;
    v_market record;
  begin
    select id, email into v_admin from public.profiles where email = ${adminEmail};
    perform set_config(
      'request.jwt.claims',
      json_build_object('sub', v_admin.id, 'email', v_admin.email, 'role', 'authenticated')::text,
      true
    );

    for v_market in
      select m.id, row_number() over (order by m.created_at, m.id) as rn
      from public.markets m
      where m.description = ${seedNote}
      order by m.created_at, m.id
    loop
      if v_market.rn <= ${RESOLVED} then
        perform public.resolve_market(
          v_market.id,
          (select o.id from public.market_outcomes o where o.market_id = v_market.id order by random() limit 1),
          'Scale seed result',
          '[]'::jsonb
        );
        if v_market.rn <= ${OVERRIDDEN} then
          perform public.resolve_market(
            v_market.id,
            (
              select o.id
              from public.market_outcomes o
              join public.markets m on m.id = o.market_id
              join public.market_resolutions r on r.id = m.current_resolution_id
              where o.market_id = v_market.id and o.id <> r.outcome_id
              order by random() limit 1
            ),
            'Scale seed override',
            '[]'::jsonb
          );
        end if;
      elsif v_market.rn <= ${RESOLVED + VOIDED} then
        perform public.void_market(v_market.id, 'Scale seed void');
      end if;
    end loop;
  end
  $$;
  `,
)

// Every resolution above ran in one transaction, so all of them, and the payouts they wrote,
// share one moment; the leaderboard's race (#145) would show a single step. Spread each settled
// market over the last few weeks instead, with an override an hour after the result it replaced.
await run(
  'Settlement times spread over the last 25 days',
  `
  select setseed(0.43);
  create temp table scale_settled on commit drop as
    select m.id as market_id, now() - interval '1 hour' - random() * interval '25 days' as at
    from public.markets m
    where m.description = ${seedNote} and m.status in ('resolved', 'voided');

  -- A market settles after it closes, and nobody bets on a closed market: close each one half an
  -- hour before it settles, open it at least a week earlier, and spread its bets (and their ledger
  -- rows, matched by rank as above) over that window, still in the order they were placed.
  update public.markets m
  set close_at = s.at - interval '30 minutes',
    created_at = least(m.created_at, s.at - interval '7 days')
  from scale_settled s
  where m.id = s.market_id;

  create temp table scale_settled_bets on commit drop as
    select b.id, b.market_id,
      row_number() over (partition by b.market_id order by b.id) as rank,
      m.created_at + (row_number() over (partition by b.market_id order by b.id) - 0.5)
        / count(*) over (partition by b.market_id) * (m.close_at - m.created_at) as at
    from public.bets b
    join public.markets m on m.id = b.market_id
    join scale_settled s on s.market_id = m.id;

  update public.bets b set created_at = x.at from scale_settled_bets x where b.id = x.id;

  with ranked as (
    select t.id, (t.meta ->> 'market_id')::uuid as market_id,
      row_number() over (partition by t.meta ->> 'market_id' order by t.id) as rank
    from public.coin_transactions t
    where t.type = 'bet_placed' and (t.meta ->> 'market_id')::uuid in (select market_id from scale_settled)
  )
  update public.coin_transactions t set created_at = x.at
  from ranked r
  join scale_settled_bets x on x.market_id = r.market_id and x.rank = r.rank
  where t.id = r.id;

  update public.market_resolutions r
  set resolved_at = s.at + case when r.id = m.current_resolution_id then interval '1 hour' else interval '0' end
  from scale_settled s
  join public.markets m on m.id = s.market_id
  where r.market_id = s.market_id;

  update public.coin_transactions t
  set created_at = s.at + interval '1 hour'
  from scale_settled s
  where t.type in ('bet_won', 'bet_refunded', 'bet_voided_refund', 'resolution_reversed')
    and (t.meta ->> 'market_id')::uuid = s.market_id;

  create temp table scale_parlay_settled on commit drop as
    select l.parlay_id, max(s.at) + interval '1 hour' as at
    from public.parlay_legs l
    join scale_settled s on s.market_id = l.market_id
    group by l.parlay_id;

  update public.parlays pa set settled_at = x.at
  from scale_parlay_settled x
  where pa.id = x.parlay_id and pa.settled_at is not null;

  update public.coin_transactions t
  set created_at = x.at
  from scale_parlay_settled x
  where t.type in ('parlay_won', 'parlay_refunded', 'parlay_reversed')
    and (t.meta ->> 'parlay_id')::uuid = x.parlay_id;
  `,
)

await run(
  `Tasks (${TASKS}) and completions (up to ${COMPLETIONS})`,
  `
  select setseed(0.42);
  ${scaleTempTables}
  insert into public.tasks (title, description, reward_amount, is_repeatable, period, created_by, created_at)
  select format('Scale task %s', n), ${seedNote}, 5 * (1 + n % 5), true, 'weekly',
    (select id from scale_members where email = ${adminEmail}), now() - interval '200 days'
  from generate_series(1, ${TASKS}) n;

  create temp table scale_tasks on commit drop as
    select id, reward_amount, row_number() over (order by id) as rn
    from public.tasks where description = ${seedNote};

  -- A member can't have two live completions of a task in one week; clashes are skipped.
  insert into public.task_completions (
    task_id, profile_id, status, reward_amount, period_key, submitted_at, reviewed_at, reviewed_by
  )
  select t.id, p.id, s.status, t.reward_amount, public.compute_period_key('weekly', s.at), s.at,
    case when s.status <> 'pending' then least(s.at + interval '1 day', now()) end,
    case when s.status <> 'pending' then (select id from scale_members where email = ${adminEmail}) end
  from (
    select 1 + floor(random() * ${TASKS})::integer as task_rn,
      1 + floor(random() * ${MEMBERS})::integer as member_rn,
      now() - random() * interval '180 days' as at,
      (array['approved', 'approved', 'approved', 'approved', 'approved', 'approved', 'approved', 'rejected', 'rejected', 'pending'])[1 + floor(random() * 10)::integer] as status
    from generate_series(1, ${COMPLETIONS})
  ) s
  join scale_tasks t on t.rn = s.task_rn
  join scale_members p on p.rn = s.member_rn
  on conflict do nothing;

  -- The same meta approve_task_completion writes.
  insert into public.coin_transactions (profile_id, amount, type, meta, created_at)
  select c.profile_id, c.reward_amount, 'task_completed',
    jsonb_build_object('task_id', c.task_id, 'completion_id', c.id), c.reviewed_at
  from public.task_completions c
  where c.status = 'approved' and c.task_id in (select id from scale_tasks)
  order by c.reviewed_at, c.id;

  ${syncBalances}
  `,
)

await run(
  'Statistics',
  'analyze public.profiles, public.markets, public.market_outcomes, public.bets, public.market_resolutions, public.coin_transactions, public.parlays, public.parlay_legs, public.tasks, public.task_completions;',
)

const [made] = await run(
  'Summary',
  `
  select
    (select count(*) from public.profiles where email like ${memberEmails}) as members,
    (select count(*) from public.markets where description = ${seedNote} and status = 'open') as open_markets,
    (select count(*) from public.markets where description = ${seedNote} and status = 'resolved') as resolved_markets,
    (select count(*) from public.markets where description = ${seedNote} and status = 'voided') as voided_markets,
    (select count(*) from public.bets b join public.markets m on m.id = b.market_id where m.description = ${seedNote}) as bets,
    (select count(*) from public.market_resolutions r join public.markets m on m.id = r.market_id where m.description = ${seedNote}) as resolutions,
    (select count(*) from public.parlays pa join public.profiles p on p.id = pa.profile_id where p.email like ${memberEmails}) as parlays,
    (select count(*) from public.task_completions c join public.tasks t on t.id = c.task_id where t.description = ${seedNote}) as task_completions,
    (select count(*) from public.coin_transactions t join public.profiles p on p.id = t.profile_id where p.email like ${memberEmails}) as ledger_rows
  `,
)

console.log(`\nSeeded run ${tag} into ${url}:`)
for (const [label, count] of Object.entries(made)) console.log(`  ${label.replaceAll('_', ' ')}: ${count}`)
