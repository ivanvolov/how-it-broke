# How It Broke

Security failures explained **at the depth you want them**.

A post-mortem has one setting. A tweet says "$186M gone, bad initialization" and
teaches you nothing; the full write-up is forty pages and you bounce off it. Both
are the same story told at a fixed depth, and neither depth is right for everyone
reading.

So: every story here is three parts, and every part has **five levels of detail
that you dial yourself**. Level 1 is one sentence. Level 5 is what an auditor
would want, including the parts where the public record contradicts itself.

The levels are **additive**. Level 3 renders L1 + L2 + L3 as one continuous text
rather than replacing what came before, so turning the dial up never asks you to
re-read a paragraph you already understood. You only ever get *more*.

## Reading one

Hover a section and the whole block lifts, with a large arrow in each margin —
left for less, right for more. New text arrives with a slow wash that drains over
eight seconds, so you can see exactly what was just added without hunting for it.

On a phone the arrows sit under the text instead of beside it.

## Running it

No dependencies. Node 18+ and nothing else.

```bash
npm run build     # stories/*/story.md -> dist/*/index.html + dist/index.html
npm run dev       # build, then serve dist/ on :8100
node build.mjs stories/nomad-bridge    # just one story, no index
```

Each built page is a **single self-contained file** — styles, script and the
whole story inlined, no external requests. It works from a `file://` path, as an
email attachment, or on any static host.

## Writing one

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

The page shell is `template.html`, a single file with `__TITLE__`,
`__HEADLINE__`, `__SUBJECT__`, `__DEK__` and `__DATA__` placeholders.

### The hard part is the writing, not the format

Each level has to be a genuine increment. The failure mode is writing five levels
that restate each other with more words — then the dial is decoration. A useful
test: read L1 and L4 back to back and check that L4 answers a question L1 made
you ask.

Level 5 is where this pays off. It is the only place with room for *"three things
commonly stated about this that are wrong"*, and that section is usually the
most valuable thing on the page.

## Accuracy

Every claim is checked against primary sources — contract code, transactions at
specific blocks, the audit report, court and regulatory filings — not against
other write-ups. Where sources genuinely disagree, level 5 says so and explains
why rather than picking the most quotable number.

The Nomad story exists partly because the widely-repeated version of that hack is
wrong in three separable ways. Catching that is the point.

## Stories

| | |
|---|---|
| `nomad-bridge` | 1 Aug 2022 — a bridge that treated every unseen message as already proven |

Planned: the common failure classes rather than only the famous incidents —
reentrancy, missing access control, oracle manipulation, unsafe casts, rounding
that compounds, and governance you can rent for one transaction.

## Notes

**"The Long Version"** is reserved as the name for the eventual public site and
newsletter built on top of this — the repo stays `how-it-broke`, the publication
becomes *The Long Version*. Same idea from the other side: here's the short
answer, and here's the long version.
