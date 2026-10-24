# Contributing to Optic

Thanks for helping. Bug reports, fixes, docs and new reports are all welcome.

## Setup

```bash
npm install
npm run seed     # demo data, so every report has something to show
npm run dev
```

Sign in at <http://localhost:3000> with the password `optic`.

## Before you open a pull request

```bash
npm run lint && npm run typecheck && npm test && npm run build
```

CI runs the same commands plus a Docker build.

## Guidelines

- **Keep the tracker small and dependency-free.** `public/optic.js` runs on other people's sites; every byte and every
  global matters. Test changes in the demo shop at `/demo`.
- **Privacy is a feature.** New data collection needs a reason, a setting if it is sensitive, and a line in
  [docs/tracker.md](docs/tracker.md). Never store raw IP addresses or query strings.
- **Reports are SQL.** Put queries in `src/lib/query/`, bind every value as a parameter, take dimension names only from
  the allow-list in `context.ts`, and add a case to `tests/pipeline.test.ts`.
- **Statistics are pure functions** in `src/lib/stats.ts` with unit tests.
- **Define new metrics** in [docs/metrics.md](docs/metrics.md).
- Charts use the tokens in `globals.css`. Do not add new series colours; the palette is checked for colour-vision
  deficiency in both themes.

## Commit messages

Write in the imperative and describe what changes for a user: "Add revenue per session to Explore", not "update
reports.ts".

By contributing you agree that your contribution is licensed under the MIT License.
