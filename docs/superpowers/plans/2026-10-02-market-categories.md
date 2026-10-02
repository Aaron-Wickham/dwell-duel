# Market categories (#327) — implementation plan

Binding design: the "Design approved (2026-10-02)" comment on #327. Since it was written, 0102 took
the name `create_market_v3` (LMSR markets), so the category-aware create is `create_market_v4`.

## Database: `0103_market_categories.sql` (additive)
- `market_categories` (id, name 1–24 in normal form, generated unique `slug`, created_by,
  created_at, hidden_at); RLS select for invited members; writes only through definer functions.
  "Other" seeded with a fixed id.
- `markets.category_id` NOT NULL default Other, FK; index `(category_id, status, close_at, id)`.
- `market_edits.old_category_id` / `new_category_id` (null when the category didn't change).
- `category_for_name(text)` (internal): finds or creates by slug, re-shows a hidden one.
- `create_market_v4(…, p_category)`: v3 plus the category; retry-safe on the attempt key; lmsr.
  v3 stays for the build still serving during the deploy.
- `update_market(p_market_id, p_title, p_description, p_category)`: a new 4-argument version
  (the 3-argument one stays for the old build). Creator until close, admin any time; a null title
  keeps the wording, which is how an admin recategorises a closed market.
- Admin: `rename_market_category`, `merge_market_categories`, `set_market_category_hidden`.
- `category_counts(p_include_hidden)`: open and total markets per category, busiest first, ties
  by name.

## App
- `lib/markets/categories.ts`: read counts, pick the 8 busiest / 6 most used, read `?category=`.
- `lib/forms/limits.ts`: `TEXT_LIMITS.category = 24`.
- Create action/form: category field (`<input list>` + `<datalist>`, 6 chips), `create_market_v4`.
- Edit dialog/action: category field; admins can open it after close (category only).
- Markets list: category chip row (All, 8 busiest, More… dialog) with `?category=`, the
  "Showing … in X · Show all categories" line, every list filtered by category; `?mine=` chips
  and their filter removed.
- Market card and market page header: category chip. Edit history: "Category was: X".
- Admin › Markets: a Categories section of ListCards with Rename, Merge (confirmed), Hide/Unhide.

## Tests
- DB: `tests/db/market-categories.test.ts` (create/find/re-show, slug uniqueness, retry, update
  rules, admin RPCs, counts, index plan), privileges list, wipe of non-Other categories.
- Unit: categories helpers, create/update actions, admin category actions, markets page.
- e2e: the create flow picks a category; markets-list chips.
- Docs: ARCHITECTURE, HOW-IT-WORKS, CHANGELOG.
