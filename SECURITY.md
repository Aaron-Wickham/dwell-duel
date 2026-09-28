# Security

DwellDuel is invite-only and uses play money, but it holds members' names,
photos and activity, so security reports are welcome.

**Please don't open a public issue for a vulnerability.** Report it privately
through GitHub: this repository's **Security** tab → **Report a
vulnerability**. You'll get a reply as soon as possible.

How the app protects data is described in
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): Google-only, invite-gated
sign-in; row-level security on every table; and all coin movement inside
permission-checked Postgres functions.
