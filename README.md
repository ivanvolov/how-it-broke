# How It Broke

Security failures explained **at the depth you want them**.

**Read it here → https://ivanvolov.github.io/how-it-broke/**

A post-mortem has one setting. A tweet says "$186M gone, bad initialization" and
teaches you nothing; the full write-up is forty pages and you bounce off it. Both
are the same story told at a fixed depth, and neither depth is right for everyone
reading.

So: every story here is three parts, and every part has **five levels of detail
that you dial yourself**. Level 1 is one sentence. Level 5 is what an auditor
would want, including the parts where the public record contradicts itself.

The levels are **additive** — turning the dial up never asks you to re-read a
paragraph you already understood, you only ever get *more*. Hover a section and
arrows appear in the margins: left for less, right for more. New text arrives
with a slow wash that drains over a few seconds, so you can see exactly what was
just added. On a phone the arrows sit under the text.

## Stories

**Published**

- **Every unseen message pre-approved** — Nomad Bridge · 1 Aug 2022 · ~$186M

**Coming soon**

- Reentrancy — Rari Capital / Fei · Apr 2022 · $80M
- Read-only reentrancy — Curve · Apr 2022 · ~$100M at risk
- Flash-loan governance — Beanstalk Farms · Apr 2022 · $182M
- Signature verification skipped — Wormhole · Feb 2022 · $326M
- Oracle manipulation — Mango Markets · Oct 2022 · $114M
- Missing access control — Parity multisig · 2017 · ~$150M frozen
- An overflow check that checked the wrong bits — Cetus · 22 May 2025 · $223M
- Rounding that compounds — Balancer v2 · 3 Nov 2025 · ~$120M
- A proof resting on a fee schedule — Constantinople / EIP-1283 · Jan 2019 · caught before the fork shipped

The list is chosen by **failure class**, not by headline size. Each one is a
different way to be wrong: a check that measures the wrong thing, an ordering
mistake, a type-system escape hatch, an assumption about who can call you, an
assumption about what a number costs. Between them they cover most of what
"Critical" actually means in practice — and two of the nine are from 2025,
because the classes don't retire, they just find newer code.

One of the nine cost nothing: a protocol upgrade pulled two days before it
shipped. It's here on purpose — a series that only covers disasters teaches you
that security is about disasters, and the near-miss is where you see the
process actually working.

Figures are provisional until a story is written and checked against primary
sources — the Nomad one moved from the widely-quoted $190M to a measured ~$185M
that way.

## Accuracy

Every claim is checked against primary sources — contract code, transactions at
specific blocks, the audit report, court and regulatory filings — not against
other write-ups. Where sources genuinely disagree, level 5 says so and explains
why rather than picking the most quotable number.

The Nomad story exists partly because the widely-repeated version of that hack is
wrong in three separable ways. Catching that is the point.

---

Building, deploying, and the story format live in [AGENTS.md](AGENTS.md).
