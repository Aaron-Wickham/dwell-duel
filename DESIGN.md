# DwellDuel: design system

For design tools and skills (Impeccable reads this file). This is a pointer, not a second copy:
the visual source of truth is **`docs/design/app-redesign-handoff.md`** (screens, tokens, type,
components, motion), the tokens themselves are in **`app/globals.css`**, and the conventions code
must follow are in **`AGENTS.md`** (UI conventions, Native feel and speed).

In brief:

- **Brand:** the DwellDuel wordmark, deep teal ink (`--ink` `#03272D`) and lime (`--lime`
  `#72DB2B`, a fill or brand only in light, never text). Manrope 400–800 throughout.
- **Colour means status** (#445): green open and won, red lost and No, gold waiting and to review,
  blue (`--info`) results and things of yours, grey done and called off; categories and avatars
  take `--tint1`…`--tint6` by a stable hash.
- **Type scale:** `h1Class`, `h2Class`, `rowTitleClass`, body, `uiTextClass`, caption; no
  `text-[Npx]` of your own.
- **Radii:** `rounded-segment` 10, `-control` 12, `-tile` 14, `-card` 18, `-full`.
- **Motion:** `--ease-*` / `--duration-*` tokens, mirrored in `lib/ui/motion.ts`; reduced motion
  cross-fades.
- **Latest boards:** the Oct 17 refresh, https://claude.ai/artifact/4kNk8MpsucUD1d1FrP9C4w, built in
  v0.11.0; the handoff doc describes the app as built.
