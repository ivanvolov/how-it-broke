---
title: $186 million, and the check that always said yes.
subject: Nomad Bridge · 1 Aug 2022
klass: Every unseen message pre-approved
loss: ~$186M
dek: A bridge spent 41 days treating every message it had never seen before as already proven. Then, in one afternoon, several hundred people noticed.
---

## Part 1 · What was Nomad Bridge, and how much did it hold?

### L1

Nomad was a bridge — you locked tokens on one chain and received them on another — and it was holding roughly **$186 million** on the day it broke.

### L2

No bridge can actually move a coin between chains. It locks the real asset on one side and sends a message to the other side saying *release this much, to this person*. So a bridge's entire security problem collapses into one question: **is this message genuine?**

On Ethereum, the contract that answered that question was called `Replica`.

### L3

`Replica` answered it in two public steps. `prove(leaf, proof, index)` checked that a message really belonged to a batch the other chain had committed to — a root signed by Nomad's bonded updater and aged past a fraud window — and wrote that fact down. `process(message)` then delivered it, by calling `recipient.handle(...)` on the bridge's router.

Anyone could call either one — there was no whitelist, and there didn't need to be, because all the security was supposed to live in what `prove` had recorded.

Nomad was the canonical bridge for Moonbeam, Evmos, and Milkomeda, and Connext was building the next version of its network on top of Nomad's messaging layer.

### L4

What was actually in it: about **1,028 WBTC, 22,877 WETH, 87.5M USDC, 8.6M USDT, 4.5M DAI, 7.3M FRAX**, plus a long tail of thin-float alts — IAG, CQT, GERO, HBOT, CARDS, C3.

Nomad had raised $22.4M at a **$225M valuation** in April 2022, led by Polychain. It disclosed a slate of strategic backers — Coinbase Ventures, OpenSea, Crypto.com Capital, Wintermute, Polygon — on **28 July 2022**. Four days before the hack.

### L5

The `Replica` that was drained is at `0x5D94309E5a0090b165FA4181519701637B6DAEBA`, a proxy behind UpgradeBeacon `0x0876dFe4...`. Its `remoteDomain` is uint32 `1635148152` — ASCII `"avax"` — which matters later, because `process()` never checked a message's *claimed* origin against it. The `BridgeRouter` it delivered into is `0x88A69B4E698A4B090DF6CF5Bd7B2D47325Ad30A3`. Five Replicas were live on Ethereum.

The loss figure differs by source, and it is a **pricing** question rather than a factual dispute — the spread comes entirely from how you mark the illiquid alts:

| Source | Figure |
|---|---|
| FTC complaint | $186M |
| Rekt | $190M |
| Contemporaneous press (CoinDesk) | $190.4M |
| Coinbase | "over $186M" |
| Direct measurement of ERC-20 outflow | ~$185M |
| Elliptic | $156.4M |

---

## Part 2 · How was it exploited?

### L1

A code update quietly made **every message the bridge had never seen before count as already proven**, so anyone could write a message asking for money and the bridge would pay it.

### L2

It took two changes, two months apart, and neither was dangerous on its own.

When the contract was first switched on in **April 2022**, setup pre-approved the starting point — a brand-new bridge has no signed commitment yet, and "nothing committed yet" is written down as literal zero. Approving zero was correct, and harmless.

In **June 2022** a refactor changed how `process()` checked a message. That harmless zero became a skeleton key. The hole stayed open for **41 days** before anyone noticed — and then, on **1 August 2022**, hundreds of people noticed at once.

### L3

The refactor changed what `messages` stores — from a status flag to *the root a message was proven under* — and rewrote the guard accordingly, from `messages[h] == MessageStatus.Proven` to `acceptableRoot(messages[h])`.

You already know what a mapping returns for a key that was never written: zero. So an unseen message now handed `acceptableRoot` a **zero** — and April had already approved zero.

Anyone could call `process(bytes)` directly. It takes no proof argument at all.

The swarm followed from one detail: `process()` marks a message hash `PROCESSED`, so replaying identical calldata reverts. But change the payee and you change the hash, which makes it a brand-new unprocessed message. **Swapping in your own address wasn't greed — it was the only way the copy worked.** Two transactions in the same block differed in exactly 20 bytes: the payee's address.

### L4

April, in `initialize()` — which runs exactly once, at deployment:

```solidity
confirmAt[_committedRoot] = 1;   // _committedRoot == bytes32(0)
```

June, the refactor:

```diff
- mapping(bytes32 => MessageStatus) public messages;
- require(messages[_messageHash] == MessageStatus.Proven, "!proven");
+ mapping(bytes32 => bytes32) public messages;
+ require(acceptableRoot(messages[_messageHash]), "!proven");
```

And the function that decides everything:

```solidity
function acceptableRoot(bytes32 _root)
  public view returns (bool)
{
  if (_root == LEGACY_STATUS_PROVEN)
    return true;                // 1
  if (_root == LEGACY_STATUS_PROCESSED)
    return false;               // 2
                                // 0: nothing
  uint256 _time = confirmAt[_root];
  if (_time == 0) return false;
  return block.timestamp >= _time;
}
```

Cases for 1 and 2. None for 0 — though the same commit declared a constant for it, `LEGACY_STATUS_NONE = bytes32(0)`, and then never referenced it.

The message was not arbitrary, though. Four fields had to be right: `destination` had to be `"eth"`; `recipient` had to be a contract implementing `IMessageRecipient` (the BridgeRouter); and because the router's `handle()` is `onlyRemoteRouter`, `origin` + `sender` had to name an **enrolled** remote router. Get those four right and the body said whatever you wanted — 100 WBTC, to you.

### L5

Exact provenance, both halves:

- **April.** `initialize()` ran once, inside the proxy's creation transaction `0x99662dac…`, block **14,629,758**, 2022-04-21 18:00:05 UTC. `confirmAt(0x00)` has read 1 from that block on — before it, the proxy didn't exist — and still reads 1 as of September 2026.
- **June.** Beacon upgrade `0x7bccd64f…`, block **15,003,660**, 2022-06-21 18:39:29 UTC — one governance transaction upgrading six beacons system-wide, the Replica implementation among them — shipping monorepo PR #289.

Replaying the exploit calldata reverts `!proven` at block 15,003,659 and succeeds at 15,003,661. So the real exposure window is **41 days**, not the 102 that write-ups dating the bug to April imply.

Three things commonly stated that are wrong:

1. *"A routine upgrade set `committedRoot` to zero."* `committedRoot` was **not** zero at hack time — it read `0xad560880…`. Only `confirmAt[0]` persisted from April.
2. *"The auditors found it and were ignored."* Quantstamp's **QSP-19, "Proving With An Empty Leaf"** (Low Risk, Acknowledged) is about an empty *leaf* passed to `prove()`. This was an empty *root* read inside `process()`, and the attack never called `prove()`. Adjacent bug, not the same one. Zellic later measured that only ~18.6% of the deployed `Replica.sol` had been audited.
3. *"It started at 21:32 UTC."* That's when the 100-WBTC drain began. The first known successful unproven `process()` calls were at **19:50:37 UTC**, 102 minutes earlier, for ~200 TIC. And in the very block the WBTC drain began, four different addresses each pulled 100 WBTC — the original attacker's transaction landed last of the four.

Scale: 300+ distinct addresses, 960 transactions (1,175 individual withdrawals), outflow exactly zero after block 15,259,772. The original attacker ended up with about **$2.89M of ~$185M**.

---

## Part 3 · What was lost, and what happened to Nomad afterwards?

### L1

About **$186 million** left in roughly two hours. Around a fifth came back, the bridge never reopened for real, and the company went quiet.

### L2

Within days Nomad offered a deal: return 90%, keep 10% as a bounty, no legal action. That brought back about **$37.5M — roughly 20%**.

The bridge was redeployed in December 2022, but **recovery-only**: no new asset was ever allowed to bridge again. It existed so people could claim a pro-rata share of what had been recovered.

### L3

To claim, you had to pass **KYC through CoinList** — on a bridge that had never asked for KYC to take your deposit — then bridge your madAssets back for a soulbound NFT recording what you'd lost, then claim your fraction of whatever had been recovered in that particular token.

Nomad's last public statement, **12 January 2023**, said $9M had been claimed. That is about **5% of what was lost**, and it is the last number they ever published.

The knock-on hit the chains that depended on it: Moonbeam's TVL fell from $187M to ~$59M within days, Evmos from $5.7M to $1.3M. Connext — which was building on Nomad's messaging layer — pivoted to routing through canonical L2 bridges instead, kept the same message-dispatch interface, and launched anyway in February 2023.

### L4

Nomad itself simply stopped. No shutdown announcement, no dissolution filing. The last tweet is January 2023; the GitHub org went essentially dormant after December 2022, until SDK commits quietly resumed in September 2025 — three months before the FTC filed. nomad.xyz still carries the August 2022 white-hat banner — along with some unreplaced lorem ipsum.

In **December 2025** the FTC brought an action against Illusory Systems under Section 5 of the FTC Act, alleging it marketed itself as "security-first" while lacking secure coding practices, a vulnerability-disclosure process, or a kill switch. The complaint quotes internal messages, including an engineer's warning that *"continually punting is how we eventually end up getting rugged without noticing an error."* The proposed order requires making the recovered ~$37.5M available to users and ten years of biennial security assessments.

One person has been named: **Alexander Gurevich**, alleged first exploiter, ~$2.89M. Indicted in California in August 2023; arrested at Ben Gurion Airport in May 2025 boarding a flight to Russia, days after legally changing his name; Israel has since approved his extradition to the US.

### L5

Where the record goes quiet, and the caveats that matter — every live claim below re-checked 4 September 2026:

- **The FTC order still isn't final.** The docket shows nothing after the 16 December 2025 filing, despite secondary coverage describing it as settled.
- **The promised relaunch audit was never published.** `docs.nomad.xyz` still lists only the two pre-hack audits; the relaunch auditor is unknown.
- **The claim portal is gone.** `coinlist.co/help/nomad-recovery` 404s. The recovery wallet `0x94A84433…` holds 0.168 ETH.
- **No law-enforcement recovery, no exchange freeze, no stablecoin blacklist ever happened.** ZachXBT documented ~$45M in USDC that sat freezable in three exploiter addresses for 30–45 minutes; Circle never touched it. In August 2024 a labelled exploiter address moved 14,500 ETH into Tornado Cash.
- **The civil suit mostly failed.** In *Singh v. Illusory Systems* the RICO claims were dismissed in March 2024 and negligence/conversion fell to Utah's economic-loss rule. One fraud claim survived; its outcome is unreported.
- **Gurevich has not been convicted or sentenced.** Of the 300+ addresses that took part, no others were ever publicly named — including the dozens of addresses that returned funds under the amnesty.

Nobody knows how much of the $37.5M ultimately reached users. The FTC's 2025 order — implying a meaningful remainder was still undistributed three years later — is the strongest evidence that much of it never did.
