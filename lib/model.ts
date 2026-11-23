// Deterministic pre-token valuation model and farming strategy engine for token-radar-01.
// Derives implied launch valuations and 6-step actionable farm plans purely from the sealed
// DefiLlama snapshot (tvl_usd, change_7d, listed_at, category, chains) with zero hardcoded protocol names.

export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

export interface ModelConstants {
  base_multiple: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  chain_step: number;
  chain_max_extra: number;
}

export const MODEL: ModelConstants = {
  base_multiple: 0.28,
  growth_weight: 0.45,
  growth_floor: -50,
  growth_cap: 150,
  maturity_floor: 0.65,
  maturity_range: 0.45,
  maturity_days: 1095,
  unknown_age_days: 300,
  chain_step: 0.03,
  chain_max_extra: 5,
};

export const MODEL_VERSION = 'liquid-radar-v2';
export const EARLY_ROWS = 160;
export const LIVE_ROWS = 36;

export interface FarmStep {
  phase: string;
  text: string;
  cost: string;
  time: string;
}

export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: null;
  listed_at: string | null;
  gecko_id: null;
  symbol: null;
  token_status: 'pre-token';
  tier: 'watchlist' | 'early-radar';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    sector_multiple: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    chain_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  tier: 'watchlist' | 'early-radar';
  implied_value_usd: number;
  sector_multiple: number;
  growth_pct: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  chain_multiplier: number;
  capital_usd: number;
  hold_days: number;
  farm_steps: string[];
}

export interface LiveRow {
  slug: string;
  name: string;
  symbol: string | null;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  mcap_tvl_ratio: number | null;
  change_7d: number | null;
}

export interface SectorBenchmark {
  category: string;
  pre_token_count: number;
  total_tvl_usd: number;
  total_implied_usd: number;
  sector_multiple: number;
  live_median_mcap_tvl: number | null;
}

export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  total_pre_token_tvl_usd: number;
  total_implied_value_usd: number;
  sectors: SectorBenchmark[];
  rows: RadarRow[];
  live: LiveRow[];
}

export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;
const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/**
 * Sector base valuation multiple (Implied FDV/MCap to TVL baseline before growth, maturity & chain factors),
 * calibrated by category capital velocity and fee intensity.
 */
export function deriveSectorMultiple(category: string | null, fallback = MODEL.base_multiple): number {
  const c = (category ?? '').trim();
  if (
    c === 'Derivatives' ||
    c === 'Options' ||
    c === 'Options Vault' ||
    c === 'Prediction Market' ||
    c === 'Decentralized AI' ||
    c === 'AI Agents' ||
    c === 'Launchpad' ||
    c === 'NFT Marketplace' ||
    c === 'Interest Rate Derivatives'
  ) {
    return 0.42;
  }
  if (
    c === 'Dexs' ||
    c === 'Risk Curators' ||
    c === 'Basis Trading' ||
    c === 'Yield Aggregator' ||
    c === 'Liquidity Manager' ||
    c === 'Payments' ||
    c === 'Privacy'
  ) {
    return 0.34;
  }
  if (
    c === 'Lending' ||
    c === 'Uncollateralized Lending' ||
    c === 'Yield' ||
    c === 'Farm' ||
    c === 'Leveraged Farming' ||
    c === 'Synthetics' ||
    c === 'Indexes' ||
    c === 'Insurance' ||
    c === 'Collateral Markets' ||
    c === 'Restaking'
  ) {
    return 0.28;
  }
  if (
    c === 'Onchain Capital Allocator' ||
    c === 'RWA' ||
    c === 'CDP' ||
    c === 'CDP Manager' ||
    c === 'Dual-Token Stablecoin' ||
    c === 'Algo-Stables' ||
    c === 'Stablecoin Issuer' ||
    c === 'Reserve Currency' ||
    c === 'CeDeFi' ||
    c === 'OTC Marketplace' ||
    c === 'Crypto Card Issuer'
  ) {
    return 0.22;
  }
  return fallback;
}

export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  model: ModelConstants = MODEL,
): {
  implied: number;
  sectorMult: number;
  growthPct: number;
  growthMult: number;
  maturityMult: number;
  chainMult: number;
  age: number | null;
} {
  const age = ageDays(asOf, protocol.listed_at);
  const sectorMult = deriveSectorMultiple(protocol.category, model.base_multiple);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = round4(Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth)));
  const growthMult = round4(1 + (growthPct / 100) * model.growth_weight);
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult = round4(
    model.maturity_floor +
      (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range,
  );
  const chainCount = Math.max(1, protocol.chains.length);
  const chainMult = round4(1 + Math.min(chainCount - 1, model.chain_max_extra) * model.chain_step);
  const implied = Math.max(
    1,
    Math.round(protocol.tvl_usd * sectorMult * growthMult * maturityMult * chainMult),
  );
  return { implied, sectorMult, growthPct, growthMult, maturityMult, chainMult, age };
}

const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const EXCLUDED_CATEGORIES = new Set([
  'Bridge',
  'Canonical Bridge',
  'Cross Chain Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
  'Staking Pool',
  'Stablecoin Wrapper',
  'Anchor BTC',
  'CEX',
]);
const WRAPPED_OR_STAKED_WORD = /\b(wrapped|staked|staking|bridged)\b/i;
const EXCHANGE_NAME_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/i;

export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/**
 * Full pre-token eligibility rule for early radar protocols below the watchlist floor:
 * must record no token and must not be an exchange, bridge, liquid staking/restaking wrapper,
 * or versioned pool of an existing protocol.
 */
export function isRankable(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (EXCLUDED_CATEGORIES.has(p.category ?? '')) return false;
  if (VERSIONED.test(p.name)) return false;
  if (WRAPPED_OR_STAKED_WORD.test(p.name)) return false;
  if (EXCHANGE_NAME_PREFIX.test(p.name)) return false;
  return true;
}

function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

export function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 1_500_000_000) return 500;
  if (p.tvl_usd >= 400_000_000) return 300;
  if (p.tvl_usd >= 100_000_000) return 200;
  if (p.tvl_usd >= 35_000_000) return 150;
  return 100;
}

export function holdDaysFor(age: number | null): number {
  if (age === null) return 45;
  if (age < 120) return 75;
  if (age < 270) return 60;
  if (age < 540) return 45;
  return 30;
}

function primaryChainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its primary network';
}

function secondaryChainOf(p: SnapshotProtocol): string | null {
  return p.chains.length > 1 ? p.chains[1]! : null;
}

function gasProfileFor(chain: string): { setupGas: string; weeklyGas: string } {
  const c = chain.toLowerCase();
  if (c === 'ethereum' || c === 'bitcoin') {
    return { setupGas: '$5-$10 in L1 network gas', weeklyGas: '$3-$6 per weekly L1 interaction' };
  }
  if (c === 'tron' || c === 'avalanche' || c === 'binance') {
    return { setupGas: '$0.80-$2.00 in network gas', weeklyGas: '$0.50-$1.20 per weekly tx' };
  }
  return { setupGas: '$0.05-$0.45 in L2/alt-L1 gas', weeklyGas: '$0.05-$0.25 per weekly tx' };
}

function coreActionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('curator')) {
    return `Allocate $${capital} USDC or WETH into ${name}'s primary curated lending vault on ${chain} to accrue continuous time-weighted vault share points.`;
  }
  if (c.includes('allocator')) {
    return `Deposit $${capital} into ${name}'s flagship automated capital allocation vault on ${chain} and retain the receipt token in your self-custody wallet.`;
  }
  if (c.includes('lend') || c.includes('collateral') || c.includes('uncollateralized')) {
    return `Supply $${capital} USDC as core lending collateral on ${name} (${chain}) and open a conservative 30% LTV borrow loop to register both lender and borrower activity.`;
  }
  if (c.includes('cdp') || c.includes('dual-token') || c.includes('algo-stable') || c.includes('stablecoin')) {
    return `Lock $${capital} of eligible collateral in ${name} on ${chain} to mint its native synthetic/stable unit at a safe >200% collateralization ratio.`;
  }
  if (c.includes('basis')) {
    return `Mint or stake $${capital} into ${name}'s delta-neutral basis yield vault on ${chain} so your address accumulates epoch funding-rate snapshots.`;
  }
  if (c.includes('dex') || c.includes('liquidity manager')) {
    return `Provide $${capital} of two-sided concentrated liquidity into ${name}'s highest-volume active pair on ${chain} and keep the LP range in-bounds.`;
  }
  if (c.includes('derivative') || c.includes('perpetual') || c.includes('option') || c.includes('synthetic')) {
    return `Deposit $${capital} USDC margin into ${name} on ${chain} and execute delta-hedged limit orders across at least 3 distinct trading epochs.`;
  }
  if (c.includes('rwa')) {
    return `Subscribe or mint $${capital} of ${name}'s tokenized real-world yield instrument on ${chain} and hold the unencumbered position across monthly NAV checkpoints.`;
  }
  if (c.includes('yield') || c.includes('farm')) {
    return `Stake $${capital} into ${name}'s principal yield strategy on ${chain} and enable auto-compounding so your principal balance registers on daily merkle snapshots.`;
  }
  if (c.includes('prediction')) {
    return `Fund $${capital} USDC on ${name} (${chain}) and provide maker liquidity across 4+ resolved market books with tight bid-ask spreads.`;
  }
  if (c.includes('payment') || c.includes('card')) {
    return `Load $${capital} USDC into ${name}'s payment settlement rail on ${chain} and route recurring settlement transfers across distinct calendar weeks.`;
  }
  return `Deploy $${capital} of productive liquidity into ${name}'s core contract on ${chain} and maintain uninterrupted custody of the position receipt.`;
}

export function stepText(step: FarmStep): string {
  let s = `[${step.phase}] ${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Maintain position through snapshot verification.`;
  return s;
}

export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = primaryChainOf(p);
  const secondChain = secondaryChainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const gas = gasProfileFor(chain);
  const coreAction = coreActionFor(p, capital, chain);
  const crossChainNote = secondChain
    ? `Interact with ${p.name}'s secondary deployment on ${secondChain} with a $25-$50 satellite position to qualify for multi-chain user multipliers.`
    : `Execute one weekly rebalance, harvest, or parameter adjustment on ${p.name} (${chain}) across at least 4 separate ISO weeks to pass anti-Sybil cadence filters.`;

  return [
    {
      phase: '1. Wallet Hygiene',
      text: `Provision a dedicated non-Sybil wallet on ${chain} funded directly from a verified exchange or clean main address with organic transaction history.`,
      cost: gas.setupGas,
      time: '10 minutes',
    },
    {
      phase: '2. Core Liquidity Deployment',
      text: coreAction,
      cost: `$${capital} deployed principal + ${gas.setupGas}`,
      time: '15 minutes initial setup',
    },
    {
      phase: '3. Cadence & Multi-Chain Multiplier',
      text: crossChainNote,
      cost: secondChain ? `$25-$50 secondary liquidity + ${gas.weeklyGas}` : gas.weeklyGas,
      time: '10 minutes per week',
    },
    {
      phase: '4. Snapshot Retention Window',
      text: `Keep the $${capital} principal untouched in ${p.name} for at least ${hold} consecutive days so time-weighted balance checkpoints capture full epoch weight.`,
      cost: `$${capital} opportunity lock (0 explicit fee)`,
      time: `${hold} days continuous hold`,
    },
    {
      phase: '5. Governance & Points Attestation',
      text: `Verify accrued points/epochs on ${p.name}'s official dashboard and participate in any snapshot governance vote or quest attestation using only official links.`,
      cost: '$0.00 off-chain signature (never pay claim fees)',
      time: '10 minutes bi-weekly',
    },
    {
      phase: '6. Audit Trail & Unwind Plan',
      text: `Record entry tx hashes, block timestamps, and receipt token balances on ${chain} so you can verify TGE merkle inclusion and cleanly unwind principal post-snapshot.`,
      cost: `$0.00 logging (${gas.setupGas} upon final withdrawal)`,
      time: '5 minutes logging',
    },
  ];
}

export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const watchSet = new Set(snapshot.watchlist);
  const chosen = new Map<string, SnapshotProtocol>();

  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }

  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, EARLY_ROWS);

  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => {
    const v = impliedValue(p, snapshot.as_of, model);
    return { p, ...v };
  });

  scored.sort(
    (a, b) =>
      b.implied - a.implied ||
      b.p.tvl_usd - a.p.tvl_usd ||
      (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0),
  );

  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: null,
    listed_at: s.p.listed_at,
    gecko_id: null,
    symbol: null,
    token_status: 'pre-token',
    tier: watchSet.has(s.p.slug) ? 'watchlist' : 'early-radar',
    age_days: s.age,
    implied_value_usd: s.implied,
    model: {
      sector_multiple: s.sectorMult,
      growth_pct: s.growthPct,
      growth_multiplier: s.growthMult,
      maturity_multiplier: s.maturityMult,
      chain_multiplier: s.chainMult,
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age).map(stepText),
  }));
}

export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX' && (p.mcap_usd ?? 0) > 0)
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      symbol: p.symbol,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      mcap_tvl_ratio: p.mcap_usd && p.tvl_usd > 0 ? round4(p.mcap_usd / p.tvl_usd) : null,
      change_7d: p.change_7d,
    }));
}

export function buildSectorBenchmarks(board: BoardRow[], snapshot: Snapshot): SectorBenchmark[] {
  const liveRatiosByCat = new Map<string, number[]>();
  for (const p of snapshot.protocols) {
    if (!isPreToken(p) && p.mcap_usd && p.tvl_usd > 0 && p.category !== 'CEX') {
      const cat = p.category ?? 'Uncategorized';
      const list = liveRatiosByCat.get(cat) ?? [];
      list.push(p.mcap_usd / p.tvl_usd);
      liveRatiosByCat.set(cat, list);
    }
  }

  const byCat = new Map<string, { count: number; tvl: number; implied: number }>();
  for (const r of board) {
    const cat = r.category ?? 'Uncategorized';
    const cur = byCat.get(cat) ?? { count: 0, tvl: 0, implied: 0 };
    cur.count += 1;
    cur.tvl += r.tvl_usd;
    cur.implied += r.implied_value_usd;
    byCat.set(cat, cur);
  }

  return [...byCat.entries()]
    .map(([category, agg]) => {
      const ratios = (liveRatiosByCat.get(category) ?? []).slice().sort((a, b) => a - b);
      const med = ratios.length > 0 ? round4(ratios[Math.floor(ratios.length / 2)]!) : null;
      return {
        category,
        pre_token_count: agg.count,
        total_tvl_usd: agg.tvl,
        total_implied_usd: agg.implied,
        sector_multiple: deriveSectorMultiple(category),
        live_median_mcap_tvl: med,
      };
    })
    .sort((a, b) => b.total_implied_usd - a.total_implied_usd);
}

export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    listed_at: row.listed_at,
    age_days: row.age_days,
    tier: row.tier,
    implied_value_usd: row.implied_value_usd,
    sector_multiple: row.model.sector_multiple,
    growth_pct: row.model.growth_pct,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    chain_multiplier: row.model.chain_multiplier,
    capital_usd: capitalFor({
      slug: row.slug,
      name: row.name,
      category: row.category,
      chains: row.chains,
      tvl_usd: row.tvl_usd,
      change_7d: row.change_7d,
      mcap_usd: null,
      listed_at: row.listed_at,
      gecko_id: null,
      symbol: null,
    }),
    hold_days: holdDaysFor(row.age_days),
    farm_steps: row.farm_steps,
  };
}

export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => r.tier === 'early-radar').length;
  const totalTvl = board.reduce((acc, r) => acc + r.tvl_usd, 0);
  const totalImplied = board.reduce((acc, r) => acc + r.implied_value_usd, 0);
  const sectors = buildSectorBenchmarks(board, snapshot);

  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    total_pre_token_tvl_usd: totalTvl,
    total_implied_value_usd: totalImplied,
    sectors,
    rows: board.map(radarRow),
    live,
  };
  return { board, radar };
}

export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not valid JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new SnapshotError('snapshot.json is not a JSON object');
  }
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) {
    throw new SnapshotError('snapshot.json is missing a valid as_of date');
  }
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json is missing source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) {
    throw new SnapshotError('snapshot.json is missing floor_usd');
  }
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json is missing protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) {
    throw new SnapshotError('snapshot.json is missing watchlist array');
  }
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) {
      throw new SnapshotError(`protocol ${i} is not an object`);
    }
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`protocol ${i} is missing slug, name, or tvl_usd`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100 || board.length > 4000) {
    return `board has ${board.length} rows (must be 100..4000)`;
  }
  const validSlugs = new Set(snapshot.protocols.map((p) => p.slug));
  const seenSlugs = new Set<string>();
  for (const r of board) {
    if (!validSlugs.has(r.slug)) return `unknown snapshot slug ${r.slug}`;
    if (seenSlugs.has(r.slug)) return `duplicate slug ${r.slug}`;
    seenSlugs.add(r.slug);
  }
  const missing = snapshot.watchlist.filter((s) => !seenSlugs.has(s));
  if (missing.length > 0) {
    return `board is missing ${missing.length} watchlist slug(s): ${missing.slice(0, 5).join(', ')}`;
  }
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) {
    if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  }
  for (let i = 1; i < board.length; i++) {
    if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) {
      return `row ${i + 1} outranks row ${i} on implied_value_usd`;
    }
  }
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all rows share identical implied_value_usd`;
  }
  for (const r of board) {
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) {
      return `${r.slug} has ${r.farm_steps.length} farm_steps`;
    }
    for (const s of r.farm_steps) {
      const trimmed = s.trim();
      if (trimmed.length < 20 || trimmed.length > 600) {
        return `${r.slug} has a farm step of ${trimmed.length} chars`;
      }
    }
    if (
      !Number.isSafeInteger(r.implied_value_usd) ||
      r.implied_value_usd <= 0 ||
      r.implied_value_usd > 100_000_000_000_000
    ) {
      return `${r.slug} has invalid implied_value_usd ${r.implied_value_usd}`;
    }
  }
  return null;
}

export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
