# How It Broke — working on this repo

The README is for readers. This file is for anyone building, deploying, or
writing stories.

## Running it

No dependencies. Node 18+ and nothing else.

```bash
npm run build     # stories/*/story.md -> dist/*/index.html + dist/index.html
npm run dev       # build, then serve dist/ on :8100
node build.mjs stories/nomad-bridge    # just one story, no index
npm run deploy    # build, then publish dist/ to the gh-pages branch
```

A GitHub Actions workflow that deploys on every push to `main` is ready in
`deploy/pages-workflow.yml`. It lives there rather than in `.github/workflows/`
because pushing that path needs the `workflow` OAuth scope; move it across and
`npm run deploy` becomes unnecessary.

Each built page is a **single self-contained file** — styles, script and the
whole story inlined, no external requests. It works from a `file://` path, as an
email attachment, or on any static host.

## Writing a story

One folder per story under `stories/`. The folder name becomes the URL.

````markdown
---
title: $186 million, and the check that always said yes.
subject: Nomad Bridge · 1 Aug 2022
dek: A bridge spent 41 days treating every message it had never seen before as already proven.
---

## Part 1 · What was it, and how much did it hold?

### L1
One sentence. The whole answer, for someone with ten seconds.

### L2
The next increment — which reads on from L1 rather than restating it.

### L3
Now the mechanism, with the function names.

### L4
The code.

### L5
Blocks, transactions, dates, and where the sources disagree.
````

`## Part N · Title` opens a part. `### L1` … `### L5` are its increments, and a
`---` rule closes one. Parts and levels are **counted from the file** — a sixth
level, or a fourth part, needs no code change. Markdown supported inside a level:
paragraphs, `**bold**`, `*italic*`, `` `code` ``, links, bullet and numbered
lists, fenced code blocks, and tables.

The levels are **additive**: level 3 renders L1 + L2 + L3 as one continuous
text rather than replacing what came before. Write each level to read on from
the previous one, never to restate it.

The page shell is `template.html`, a single file with `__TITLE__`,
`__HEADLINE__`, `__SUBJECT__`, `__DEK__` and `__DATA__` placeholders.

Unwritten stories are listed in `planned.json` — `{id, subject, klass, dek,
loss}` per entry. The index page renders them greyed and unlinked after the
published ones. When a story ships, delete its entry and the folder takes over.

The list is curated by **failure class**, not headline size — each entry should
be a different way to be wrong, and at least one near-miss stays in on purpose.
Loss figures are provisional until the story is written and checked against
primary sources.

## The hard part is the writing, not the format

Each level has to be a genuine increment. The failure mode is writing five levels
that restate each other with more words — then the dial is decoration. A useful
test: read L1 and L4 back to back and check that L4 answers a question L1 made
you ask.

Level 5 is where this pays off. It is the only place with room for *"three things
commonly stated about this that are wrong"*, and that section is usually the
most valuable thing on the page.

Every claim is checked against primary sources — contract code, transactions at
specific blocks, the audit report, court and regulatory filings — not against
other write-ups. Where sources genuinely disagree, level 5 says so and explains
why rather than picking the most quotable number.

## Notes

**"The Long Version"** is reserved as the name for the eventual public site and
newsletter built on top of this — the repo stays `how-it-broke`, the publication
becomes *The Long Version*. Same idea from the other side: here's the short
answer, and here's the long version.
