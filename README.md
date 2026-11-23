# token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Rickyz3r0/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/Rickyz3r0/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Deterministic pre-token launch valuation engine, 6-step protocol farming strategy planner, and offline **iOS 27 Liquid Glass** interactive web dashboard built for the `token-radar-01` bounty on [make.fun](https://make.fun/bounty/token-radar-01).

## Architecture & Highlights

- **100% Watchlist Coverage + Early Discovery Radar (`174` Ranked Pre-Token Protocols)**:
  - Covers all **40** protocols on the sealed DefiLlama `$50M+` watchlist (`100%` floor coverage).
  - Applies the full non-wrapped, non-staked, non-bridged, non-versioned, non-exchange filter across protocols below `$50M` TVL to surface **134** clean early-stage tokenless protocols (`174` total rows in `board.json`).
  - Explicitly separates **36** live-token benchmark protocols (`mcap_usd` recorded) into a dedicated benchmark tab with empirical `MCap / TVL` sector multiples.
- **Multi-Factor Implied Launch Valuation Model (`liquid-radar-v2`)**:
  - Computed identically in [`lib/model.ts`](lib/model.ts) (`impliedValue`) and in [`dashboard/app.js`](dashboard/app.js) (`computeImpliedValuation`), with zero hardcoded protocol names:
    $$\text{Implied Value} = \text{round}\!\left(\text{TVL} \times M_{\text{sector}} \times M_{\text{growth7d}} \times M_{\text{tenure}} \times M_{\text{chains}}\right)$$
- **Actionable 6-Step Farming Playbooks (`farmSteps`)**:
  - Generates 6 concrete steps per protocol (`1. Wallet Hygiene`, `2. Core Liquidity Deployment`, `3. Cadence & Multi-Chain Multiplier`, `4. Snapshot Retention Window`, `5. Governance & Points Attestation`, `6. Audit Trail & Unwind Plan`) tailored to each protocol's category, primary/secondary chains, TVL capital tier (`$100–$500`), chain-specific gas profile, and pre-token tenure (`30–75 days`).
- **iOS 27 Liquid Glass Offline Dashboard (`dashboard/`)**:
  - Translucent frosted-glass cards (`backdrop-filter: blur(28px) saturate(165%)`), specular hairline borders, custom interactive SVG sector & scatter charts, and a per-protocol detail drawer with an SVG valuation multiplier waterfall.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../token-radar-01-kit/input/snapshot.json
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=znn5ba7g&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
