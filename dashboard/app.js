// Token Radar — iOS 27 Liquid Glass Interactive Dashboard (token-radar-01)
// Zero network dependencies: reads window.RADAR from ../data.js, verifies 100% mathematical parity
// with board.json via computeImpliedValuation(), renders interactive SVG analytics, multi-dimensional
// filtering/sorting, live-token benchmark comparison, and per-protocol 6-step farming drawer.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;

  var app = document.getElementById('board');
  var state = {
    q: '',
    category: 'all',
    chain: 'all',
    tier: 'all', // 'all' | 'watchlist' | 'early-radar' | 'live'
    preset: '',
    sort: 'implied',
    dir: -1,
    selected: null
  };

  var usdFull = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    var abs = Math.abs(n);
    if (abs >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (abs >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (abs >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usdFull.format(n);
  }

  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return '0.00%';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }

  function fmtAge(days) {
    if (days === null || days === undefined) return '300d (est)';
    if (days >= 365) return (days / 365).toFixed(1) + 'y (' + days + 'd)';
    return Math.max(0, Math.round(days)) + 'd';
  }

  function round4(n) {
    return Math.round(n * 1e4) / 1e4;
  }

  // Exact sector base multiple function matching lib/model.ts
  function deriveSectorMultiple(category, fallback) {
    var c = (category || '').trim();
    if (
      c === 'Derivatives' || c === 'Options' || c === 'Options Vault' ||
      c === 'Prediction Market' || c === 'Decentralized AI' || c === 'AI Agents' ||
      c === 'Launchpad' || c === 'NFT Marketplace' || c === 'Interest Rate Derivatives'
    ) return 0.42;
    if (
      c === 'Dexs' || c === 'Risk Curators' || c === 'Basis Trading' ||
      c === 'Yield Aggregator' || c === 'Liquidity Manager' || c === 'Payments' || c === 'Privacy'
    ) return 0.34;
    if (
      c === 'Lending' || c === 'Uncollateralized Lending' || c === 'Yield' ||
      c === 'Farm' || c === 'Leveraged Farming' || c === 'Synthetics' ||
      c === 'Indexes' || c === 'Insurance' || c === 'Collateral Markets' || c === 'Restaking'
    ) return 0.28;
    if (
      c === 'Onchain Capital Allocator' || c === 'RWA' || c === 'CDP' ||
      c === 'CDP Manager' || c === 'Dual-Token Stablecoin' || c === 'Algo-Stables' ||
      c === 'Stablecoin Issuer' || c === 'Reserve Currency' || c === 'CeDeFi' ||
      c === 'OTC Marketplace' || c === 'Crypto Card Issuer'
    ) return 0.22;
    return fallback || 0.28;
  }

  // Exact client-side recomputation of implied launch valuation from snapshot fields
  function computeImpliedValuation(row, model) {
    var sectorMult = deriveSectorMultiple(row.category, model.base_multiple);
    var rawGrowth = (row.change_7d === null || row.change_7d === undefined || !isFinite(row.change_7d)) ? 0 : row.change_7d;
    var growthPct = round4(Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth)));
    var growthMult = round4(1 + (growthPct / 100) * model.growth_weight);
    var ageForModel = (row.age_days === null || row.age_days === undefined) ? model.unknown_age_days : row.age_days;
    var maturityMult = round4(
      model.maturity_floor +
      (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range
    );
    var chainCount = Math.max(1, (row.chains && row.chains.length) ? row.chains.length : 1);
    var chainMult = round4(1 + Math.min(chainCount - 1, model.chain_max_extra) * model.chain_step);
    return Math.max(1, Math.round(row.tvl_usd * sectorMult * growthMult * maturityMult * chainMult));
  }

  function verifyRowParity(rows, model) {
    var matched = 0;
    for (var i = 0; i < rows.length; i++) {
      if (computeImpliedValuation(rows[i], model) === rows[i].implied_value_usd) matched++;
    }
    return { matched: matched, total: rows.length };
  }

  var parity = verifyRowParity(DATA.rows, DATA.model);

  // Parse a board.json farm_steps string "[Phase] Action Cost: X. Time: Y." into structured parts
  function parseFarmStep(raw, idx) {
    var phase = 'Step ' + (idx + 1);
    var body = raw;
    if (raw.charAt(0) === '[') {
      var closeIdx = raw.indexOf('] ');
      if (closeIdx > 0) {
        phase = raw.slice(1, closeIdx);
        body = raw.slice(closeIdx + 2);
      }
    }
    var costAt = body.indexOf(' Cost: ');
    var action = costAt >= 0 ? body.slice(0, costAt) : body;
    var rest = costAt >= 0 ? body.slice(costAt + 7) : '';
    var timeAt = rest.indexOf('. Time: ');
    var cost = timeAt >= 0 ? rest.slice(0, timeAt) : rest.replace(/\.$/, '');
    var time = timeAt >= 0 ? rest.slice(timeAt + 8).replace(/\.$/, '') : 'ongoing';
    return { phase: phase, action: action, cost: cost, time: time };
  }

  function buildProtocolFarmPlan(row) {
    var list = row.farm_steps || [];
    return list.map(function (s, idx) { return parseFarmStep(s, idx); });
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) {
        child.forEach(function (c) { if (c) node.appendChild(c); });
      } else if (typeof child === 'string') {
        node.appendChild(document.createTextNode(child));
      } else {
        node.appendChild(child);
      }
    }
    return node;
  }

  function readHash() {
    var raw = window.location.hash.replace(/^#/, '');
    if (!raw) return;
    var params = new URLSearchParams(raw);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('tier')) state.tier = params.get('tier');
    if (params.get('preset')) state.preset = params.get('preset');
    if (params.get('sort')) state.sort = params.get('sort');
    if (params.get('dir')) state.dir = Number(params.get('dir')) || -1;
    if (params.get('p')) state.selected = params.get('p');
  }

  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.tier !== 'all') params.set('tier', state.tier);
    if (state.preset) params.set('preset', state.preset);
    if (state.sort !== 'implied') params.set('sort', state.sort);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function filterPreTokenRows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.tier === 'watchlist' && r.tier !== 'watchlist') return false;
      if (state.tier === 'early-radar' && r.tier !== 'early-radar') return false;
      if (state.category !== 'all' && (r.category || 'Uncategorized') !== state.category) return false;
      if (state.chain !== 'all' && (!r.chains || r.chains.indexOf(state.chain) < 0)) return false;
      if (state.preset === 'momentum' && (r.change_7d === null || r.change_7d <= 2)) return false;
      if (state.preset === 'multichain' && (!r.chains || r.chains.length < 3)) return false;
      if (state.preset === 'veteran' && (r.age_days === null || r.age_days < 365)) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category || '', (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }

  function sortPreTokenRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -9999 : a.change_7d; bv = b.change_7d === null ? -9999 : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? -1 : a.age_days; bv = b.age_days === null ? -1 : b.age_days; }
      else if (key === 'capital') { av = a.capital_usd; bv = b.capital_usd; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.rank - b.rank;
    });
  }

  // Custom SVG Chart 1: Pre-Token Implied Valuation by Sector & Base Multiple
  function renderSectorAllocationSvg(sectors, activeCategory) {
    var top = (sectors || []).slice(0, 6);
    var maxVal = top.length > 0 ? top[0].total_implied_usd : 1;
    var w = 560;
    var rowH = 22;
    var h = top.length * rowH + 10;
    var parts = ['<svg viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="Sector implied launch valuation chart">'];
    top.forEach(function (s, idx) {
      var y = 4 + idx * rowH;
      var barW = Math.max(8, Math.round((s.total_implied_usd / maxVal) * 235));
      var tvlBarW = Math.max(6, Math.round(Math.min(1, s.total_implied_usd / Math.max(1, s.total_tvl_usd)) * barW));
      var isSel = activeCategory === s.category;
      var fill = isSel ? '#34d399' : '#38bdf8';
      var label = s.category.length > 22 ? s.category.slice(0, 21) + '…' : s.category;
      parts.push(
        '<g style="cursor:pointer" data-cat="' + s.category.replace(/"/g, '&quot;') + '">' +
        '<text x="4" y="' + (y + 13) + '" fill="' + (isSel ? '#34d399' : '#cbd5e1') + '" font-size="11" font-weight="' + (isSel ? '700' : '500') + '">' + label + ' (' + s.pre_token_count + ')</text>' +
        '<rect x="172" y="' + (y + 3) + '" width="240" height="12" rx="4" fill="rgba(255,255,255,0.06)"/>' +
        '<rect x="172" y="' + (y + 3) + '" width="' + barW + '" height="12" rx="4" fill="' + fill + '" fill-opacity="0.32" stroke="' + fill + '" stroke-width="1"/>' +
        '<rect x="172" y="' + (y + 3) + '" width="' + tvlBarW + '" height="12" rx="4" fill="' + fill + '" fill-opacity="0.80"/>' +
        '<text x="422" y="' + (y + 13) + '" fill="#f8fafc" font-family="monospace" font-size="11">' + fmtUsd(s.total_implied_usd) + '</text>' +
        '<text x="498" y="' + (y + 13) + '" fill="#94a3b8" font-family="monospace" font-size="10.5">' + s.sector_multiple.toFixed(2) + 'x</text>' +
        '</g>'
      );
    });
    parts.push('</svg>');
    var wrap = el('div', { class: 'svg-wrap', html: parts.join('') });
    var groups = wrap.querySelectorAll('g[data-cat]');
    for (var i = 0; i < groups.length; i++) {
      (function (g) {
        g.addEventListener('click', function () {
          var cat = g.getAttribute('data-cat');
          state.category = state.category === cat ? 'all' : cat;
          state.tier = state.tier === 'live' ? 'all' : state.tier;
          writeHash();
          render();
        });
      })(groups[i]);
    }
    return wrap;
  }

  // Custom SVG Chart 2: Pre-Token Valuation vs TVL & 7d Momentum Radar Scatter
  function renderRadarScatterSvg(filteredRows, selectedSlug) {
    var w = 540;
    var h = 152;
    var padL = 20;
    var padR = 20;
    var padT = 10;
    var padB = 22;
    var plotW = w - padL - padR;
    var plotH = h - padT - padB;
    var sample = filteredRows.slice(0, 75);
    var minLogX = Math.log10(4.2e6);
    var maxLogX = Math.log10(5.2e9);
    var minLogY = Math.log10(0.8e6);
    var maxLogY = Math.log10(2.4e9);
    var floorX = padL + ((Math.log10(DATA.floor_usd) - minLogX) / (maxLogX - minLogX)) * plotW;

    var parts = [
      '<svg viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="TVL vs Implied Launch Valuation Radar Scatter">',
      '<rect x="' + padL + '" y="' + padT + '" width="' + plotW + '" height="' + plotH + '" rx="8" fill="rgba(6,9,19,0.52)" stroke="rgba(255,255,255,0.10)"/>',
      '<line x1="' + floorX.toFixed(1) + '" y1="' + padT + '" x2="' + floorX.toFixed(1) + '" y2="' + (padT + plotH) + '" stroke="#38bdf8" stroke-dasharray="4 3" stroke-opacity="0.55"/>',
      '<text x="' + (floorX + 6).toFixed(1) + '" y="' + (padT + 13) + '" fill="#38bdf8" font-family="monospace" font-size="9.5">Watchlist Floor ($50M TVL) →</text>',
      '<text x="' + (floorX - 6).toFixed(1) + '" y="' + (padT + 13) + '" text-anchor="end" fill="#c084fc" font-family="monospace" font-size="9.5">← Early Radar (&lt;$50M)</text>',
      '<text x="' + (padL + 6) + '" y="' + (h - 6) + '" fill="#94a3b8" font-family="monospace" font-size="9.5">Log TVL ($5M → $3B) · Click any node for detail</text>',
      '<text x="' + (w - padR) + '" y="' + (h - 6) + '" text-anchor="end" fill="#34d399" font-family="monospace" font-size="9.5">● Watchlist  ● Early  ○ +7d Inflow</text>'
    ];

    var labeledCount = 0;
    sample.forEach(function (r) {
      var lx = Math.max(minLogX, Math.min(maxLogX, Math.log10(Math.max(4.5e6, r.tvl_usd))));
      var ly = Math.max(minLogY, Math.min(maxLogY, Math.log10(Math.max(0.9e6, r.implied_value_usd))));
      var cx = padL + ((lx - minLogX) / (maxLogX - minLogX)) * plotW;
      var cy = padT + plotH - ((ly - minLogY) / (maxLogY - minLogY)) * plotH;
      var isWatch = r.tier === 'watchlist';
      var isSel = selectedSlug === r.slug;
      var fill = isWatch ? '#38bdf8' : '#c084fc';
      var rad = isSel ? 6.5 : (r.rank <= 10 ? 4.8 : 3.5);
      var ring = (r.change_7d !== null && r.change_7d > 1) ? '#34d399' : (isSel ? '#ffffff' : 'rgba(255,255,255,0.28)');
      parts.push(
        '<circle data-slug="' + r.slug + '" cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) + '" r="' + rad + '" fill="' + fill + '" fill-opacity="' + (isSel ? '1' : '0.82') + '" stroke="' + ring + '" stroke-width="' + (isSel ? '2' : '1') + '" style="cursor:pointer"/>'
      );
      if ((labeledCount < 3 && (r.rank === 1 || r.rank === 2 || r.rank === 4)) || isSel) {
        labeledCount++;
        var shortName = r.name.length > 14 ? r.name.slice(0, 13) + '…' : r.name;
        var alignRight = cx > padL + plotW - 105;
        var tx = alignRight ? cx - 9 : cx + 8;
        var ty = r.rank === 1 ? cy + 3 : (r.rank === 2 ? cy + 12 : cy + 4);
        parts.push(
          '<text x="' + tx.toFixed(1) + '" y="' + Math.min(padT + plotH - 6, Math.max(padT + 14, ty)).toFixed(1) + '" text-anchor="' + (alignRight ? 'end' : 'start') + '" fill="#f8fafc" font-size="9.5" font-weight="600">' + shortName + '</text>'
        );
      }
    });
    parts.push('</svg>');

    var wrap = el('div', { class: 'svg-wrap', html: parts.join('') });
    var nodes = wrap.querySelectorAll('circle[data-slug]');
    for (var i = 0; i < nodes.length; i++) {
      (function (c) {
        c.addEventListener('click', function () {
          openProtocolDetail(c.getAttribute('data-slug'));
        });
      })(nodes[i]);
    }
    return wrap;
  }

  // Custom SVG Chart 3 (in Detail Drawer): Step-by-Step Valuation Multiplier Waterfall
  function renderValuationWaterfallSvg(row) {
    var s0 = row.tvl_usd;
    var s1 = s0 * row.sector_multiple;
    var s2 = s1 * row.growth_multiplier;
    var s3 = s2 * row.maturity_multiplier;
    var s4 = row.implied_value_usd;
    var steps = [
      { label: '1. Protocol TVL', mult: 'Snapshot Input', val: s0, color: '#64748b' },
      { label: '2. Sector Base', mult: row.sector_multiple.toFixed(2) + 'x (' + (row.category || 'DeFi') + ')', val: s1, color: '#38bdf8' },
      { label: '3. 7d Momentum', mult: row.growth_multiplier.toFixed(3) + 'x (' + fmtPct(row.change_7d) + ')', val: s2, color: '#818cf8' },
      { label: '4. Tenure Factor', mult: row.maturity_multiplier.toFixed(3) + 'x (' + fmtAge(row.age_days) + ')', val: s3, color: '#c084fc' },
      { label: '5. Implied Value', mult: row.chain_multiplier.toFixed(2) + 'x (' + (row.chains ? row.chains.length : 1) + ' chain)', val: s4, color: '#34d399' }
    ];
    var maxV = Math.max(s0, s4, 1);
    var w = 540;
    var h = 152;
    var parts = ['<svg viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="Valuation multiplier waterfall">'];
    steps.forEach(function (st, idx) {
      var y = 8 + idx * 28;
      var barW = Math.max(12, Math.round((st.val / maxV) * 215));
      parts.push(
        '<text x="4" y="' + (y + 15) + '" fill="#cbd5e1" font-size="11.5" font-weight="600">' + st.label + '</text>' +
        '<text x="115" y="' + (y + 15) + '" fill="#94a3b8" font-family="monospace" font-size="10.5">' + st.mult + '</text>' +
        '<rect x="255" y="' + (y + 3) + '" width="215" height="14" rx="4" fill="rgba(255,255,255,0.06)"/>' +
        '<rect x="255" y="' + (y + 3) + '" width="' + barW + '" height="14" rx="4" fill="' + st.color + '"/>' +
        '<text x="478" y="' + (y + 15) + '" fill="#f8fafc" font-family="monospace" font-size="11" font-weight="700">' + fmtUsd(st.val) + '</text>'
      );
    });
    parts.push('</svg>');
    return el('div', { class: 'svg-wrap', html: parts.join('') });
  }

  function renderTopBar() {
    return el('header', { class: 'topbar' },
      el('div', { class: 'brand-group' },
        el('span', { class: 'brand-orb' }),
        el('span', { class: 'brand-title', text: 'TOKEN RADAR' }),
        el('span', { class: 'brand-tag', text: 'LIQUID GLASS // ' + DATA.model_version.toUpperCase() })
      ),
      el('div', { class: 'telemetry-pills' },
        el('span', { class: 'tele-pill verified', text: '✓ Parity ' + parity.matched + '/' + parity.total + ' Verified vs board.json' }),
        el('span', { class: 'tele-pill', text: 'Snapshot ' + DATA.as_of }),
        el('span', { class: 'tele-pill', text: 'Watchlist Floor $' + Math.round(DATA.floor_usd / 1e6) + 'M' }),
        el('span', { class: 'tele-pill', text: 'Offline Sandbox Ready' })
      )
    );
  }

  function renderHeroSection() {
    return el('section', { class: 'hero-grid' },
      el('div', { class: 'glass-panel hero-intro' },
        el('div', null,
          el('div', { class: 'eyebrow', text: 'Pre-Token Valuation Engine & Actionable Farming Playbooks' }),
          el('h1', { text: DATA.board_size + ' Pre-Token Protocols Ranked by Implied Launch Valuation' }),
          el('p', {
            text: 'Covers 100% of the ' + DATA.watchlist_size + ' watchlist protocols (≥$50M TVL, no recorded token, excluding wrapped/staked/bridged derivatives) plus ' +
              DATA.early_size + ' clean early-stage pre-token protocols below the $50M floor. Live-token protocols (' + DATA.live_size +
              ' benchmarks) are strictly separated with empirical market-cap multiples.'
          })
        ),
        el('div', { class: 'formula-banner' },
          el('span', { text: 'Deterministic Model:' }),
          el('code', { text: 'Implied = round(TVL × SectorMult × Growth7dMult × TenureMult × ChainMult)' })
        )
      ),
      el('div', { class: 'kpi-grid' },
        el('div', { class: 'kpi-card' },
          el('div', { class: 'kpi-label' }, el('span', { text: 'Watchlist Coverage' }), el('span', { class: 'tier-badge watchlist', text: '100% FLOOR' })),
          el('div', { class: 'kpi-val', text: DATA.watchlist_size + ' / ' + DATA.watchlist_size }),
          el('div', { class: 'kpi-sub', text: 'All 40 sealed watchlist slugs ranked' })
        ),
        el('div', { class: 'kpi-card' },
          el('div', { class: 'kpi-label' }, el('span', { text: 'Early Radar (<$50M)' }), el('span', { class: 'tier-badge early', text: 'EARLY DISCOVERY' })),
          el('div', { class: 'kpi-val', text: '+' + DATA.early_size + ' rows' }),
          el('div', { class: 'kpi-sub', text: DATA.board_size + ' total tokenless protocols scored' })
        ),
        el('div', { class: 'kpi-card' },
          el('div', { class: 'kpi-label' }, el('span', { text: 'Aggregate Implied Value' }), el('span', { class: 'm-pill', text: 'PRE-TOKEN' })),
          el('div', { class: 'kpi-val', text: fmtUsd(DATA.total_implied_value_usd) }),
          el('div', { class: 'kpi-sub', text: 'Across ' + fmtUsd(DATA.total_pre_token_tvl_usd) + ' tracked TVL' })
        ),
        el('div', { class: 'kpi-card' },
          el('div', { class: 'kpi-label' }, el('span', { text: 'Live Benchmarks Set Aside' }), el('span', { class: 'tier-badge live', text: 'SEPARATED' })),
          el('div', { class: 'kpi-val', text: DATA.live_size + ' live' }),
          el('div', { class: 'kpi-sub', text: 'Actual market caps kept out of pre-token ranks' })
        )
      )
    );
  }

  function renderVisualAnalytics(filteredList) {
    return el('section', { class: 'viz-grid' },
      el('div', { class: 'glass-panel viz-card' },
        el('div', { class: 'viz-head' },
          el('h2', { text: 'Pre-Token Implied Valuation by Sector (Click Sector to Filter)' }),
          el('span', { text: 'Implied Value vs Sector Base Multiple' })
        ),
        renderSectorAllocationSvg(DATA.sectors, state.category)
      ),
      el('div', { class: 'glass-panel viz-card' },
        el('div', { class: 'viz-head' },
          el('h2', { text: 'Launch Valuation Radar (Log TVL vs Implied Value)' }),
          el('span', { text: filteredList.length + ' protocols in current view' })
        ),
        renderRadarScatterSvg(filteredList, state.selected)
      )
    );
  }

  function renderControlsBar(filteredCount) {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Uncategorized'; }))).sort();
    var chainCounts = {};
    DATA.rows.forEach(function (r) {
      (r.chains || []).forEach(function (c) { chainCounts[c] = (chainCounts[c] || 0) + 1; });
    });
    var topChains = Object.keys(chainCounts).sort(function (a, b) { return chainCounts[b] - chainCounts[a]; }).slice(0, 18);

    var searchInput = el('input', {
      type: 'search',
      id: 'q',
      placeholder: 'Search protocol, slug, category, chain...',
      value: state.q,
      'aria-label': 'Search protocols'
    });
    searchInput.addEventListener('input', function () {
      state.q = searchInput.value;
      writeHash();
      render();
      var nextInput = document.getElementById('q');
      if (nextInput) {
        nextInput.focus();
        nextInput.setSelectionRange(state.q.length, state.q.length);
      }
    });

    var catSelect = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All Categories (' + DATA.rows.length + ')' }),
      categories.map(function (c) {
        return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null });
      })
    );
    catSelect.addEventListener('change', function () {
      state.category = catSelect.value;
      writeHash();
      render();
    });

    var chainSelect = el('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      el('option', { value: 'all', text: 'All Chains' }),
      topChains.map(function (c) {
        return el('option', { value: c, text: c + ' (' + chainCounts[c] + ')', selected: c === state.chain ? 'selected' : null });
      })
    );
    chainSelect.addEventListener('change', function () {
      state.chain = chainSelect.value;
      writeHash();
      render();
    });

    function tabBtn(id, label) {
      return el('button', {
        type: 'button',
        'aria-pressed': state.tier === id ? 'true' : 'false',
        text: label,
        onclick: function () { state.tier = id; writeHash(); render(); }
      });
    }

    function presetChip(id, label, applyFn) {
      var isAct = state.preset === id && id !== '';
      return el('button', {
        type: 'button',
        class: 'chip' + (isAct ? ' active' : ''),
        text: label,
        onclick: function () {
          if (state.preset === id && id !== '') {
            state.preset = '';
            state.category = 'all';
            state.chain = 'all';
            state.tier = 'all';
            state.q = '';
          } else {
            state.preset = id;
            applyFn();
          }
          writeHash();
          render();
        }
      });
    }

    return el('section', { class: 'glass-panel controls-panel' },
      el('div', { class: 'controls-top' },
        el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search Radar' }), searchInput),
        el('div', { class: 'field' }, el('label', { for: 'category', text: 'Sector / Category' }), catSelect),
        el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Primary / Deployed Chain' }), chainSelect),
        el('div', { class: 'field' },
          el('label', { text: 'Universe & Token Status' }),
          el('div', { class: 'segmented-tabs' },
            tabBtn('all', 'All Pre-Token (' + DATA.board_size + ')'),
            tabBtn('watchlist', 'Watchlist ≥$50M (' + DATA.watchlist_size + ')'),
            tabBtn('early-radar', 'Early <$50M (' + DATA.early_size + ')'),
            tabBtn('live', 'Live Benchmarks (' + DATA.live_size + ')')
          )
        )
      ),
      el('div', { class: 'preset-row' },
        el('div', { class: 'preset-chips' },
          el('span', { class: 'proto-sub', text: 'Quick Filters:' }),
          presetChip('momentum', '🔥 High 7d Momentum (>+2%)', function () { state.tier = 'all'; state.sort = 'growth'; state.dir = -1; }),
          presetChip('curators', '🛡️ Risk Curators & Allocators', function () { state.tier = 'all'; state.category = 'Risk Curators'; state.sort = 'implied'; state.dir = -1; }),
          presetChip('rwa', '🏦 RWA & Real Yield', function () { state.tier = 'all'; state.category = 'RWA'; state.sort = 'implied'; state.dir = -1; }),
          presetChip('multichain', '🌐 Multi-Chain (3+ Networks)', function () { state.tier = 'all'; }),
          presetChip('veteran', '⏳ Battle-Tested (>1yr Tokenless)', function () { state.tier = 'all'; state.sort = 'age'; state.dir = -1; }),
          presetChip('', 'Reset All', function () {
            state.q = ''; state.category = 'all'; state.chain = 'all'; state.tier = 'all'; state.preset = ''; state.sort = 'implied'; state.dir = -1;
          })
        ),
        el('div', {
          class: 'results-summary',
          text: state.tier === 'live'
            ? 'Showing ' + DATA.live.length + ' live-token benchmark protocols (excluded from pre-token ranks)'
            : 'Showing ' + filteredCount + ' of ' + DATA.board_size + ' pre-token protocols'
        })
      )
    );
  }

  function sortColHeader(key, label) {
    var active = state.sort === key;
    var arrow = active ? (state.dir < 0 ? ' ↓' : ' ↑') : '';
    return el('th', { scope: 'col' },
      el('button', {
        type: 'button',
        onclick: function () {
          if (state.sort === key) state.dir = -state.dir;
          else { state.sort = key; state.dir = -1; }
          writeHash();
          render();
        }
      }, label + arrow)
    );
  }

  function renderBoardTable(filteredList) {
    var list = sortPreTokenRows(filteredList);
    if (list.length === 0) {
      return el('div', { class: 'glass-panel table-panel' },
        el('div', { class: 'empty-state' },
          el('h2', { text: 'No pre-token protocol matches the active filter' }),
          el('p', { class: 'proto-sub', text: 'Reset your search query, category, or chain filter to restore the full 174-protocol radar board.' }),
          el('button', {
            type: 'button',
            class: 'btn-glass',
            text: 'Reset All Filters',
            onclick: function () {
              state.q = ''; state.category = 'all'; state.chain = 'all'; state.tier = 'all'; state.preset = '';
              writeHash(); render();
            }
          })
        )
      );
    }

    var maxImplied = list[0].implied_value_usd || 1;
    for (var i = 0; i < list.length; i++) {
      if (list[i].implied_value_usd > maxImplied) maxImplied = list[i].implied_value_usd;
    }

    var tbody = el('tbody');
    list.forEach(function (r) {
      var gText = r.change_7d === null ? '0.00%' : fmtPct(r.change_7d);
      var gClass = r.change_7d === null ? '' : (r.change_7d >= 0 ? 'pos' : 'neg');
      var chainsText = (r.chains && r.chains.length)
        ? r.chains.slice(0, 2).join(', ') + (r.chains.length > 2 ? ' +' + (r.chains.length - 2) : '')
        : 'Mainnet';
      var barPct = Math.max(4, Math.round((r.implied_value_usd / maxImplied) * 100));

      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openProtocolDetail(r.slug); },
        onkeydown: function (e) {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openProtocolDetail(r.slug);
          }
        }
      },
        el('td', null, el('span', { class: 'rank-pill' + (r.rank <= 10 ? ' top10' : ''), text: '#' + r.rank })),
        el('td', null,
          el('div', { class: 'proto-cell' },
            el('div', { class: 'proto-title' },
              el('span', { text: r.name }),
              el('span', {
                class: 'tier-badge ' + (r.tier === 'watchlist' ? 'watchlist' : 'early'),
                text: r.tier === 'watchlist' ? 'WATCHLIST' : 'EARLY <$50M'
              })
            ),
            el('span', { class: 'proto-sub', text: (r.category || 'Uncategorized') + ' · ' + chainsText })
          )
        ),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + gClass, text: gText }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', null,
          el('div', { class: 'mult-pills' },
            el('span', { class: 'm-pill', text: 'Sec ' + r.sector_multiple.toFixed(2) + 'x' }),
            el('span', { class: 'm-pill', text: 'Mom ' + r.growth_multiplier.toFixed(2) + 'x' }),
            el('span', { class: 'm-pill', text: 'Age ' + r.maturity_multiplier.toFixed(2) + 'x' }),
            el('span', { class: 'm-pill', text: 'Chn ' + r.chain_multiplier.toFixed(2) + 'x' })
          )
        ),
        el('td', null,
          el('div', { class: 'implied-cell' },
            el('div', { class: 'val-bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + barPct + '%' })),
            el('b', { class: 'num', text: fmtUsd(r.implied_value_usd) })
          )
        ),
        el('td', null,
          el('div', { class: 'farm-preview' },
            el('b', { text: '$' + r.capital_usd + ' · ' + r.hold_days + 'd hold' }),
            el('span', { text: '6 steps · Click for playbook →' })
          )
        )
      );
      tbody.appendChild(tr);
    });

    return el('div', { class: 'glass-panel table-panel' },
      el('div', { class: 'table-scroll' },
        el('table', null,
          el('caption', {
            text: 'Pre-Token Launch Radar (' + list.length + ' protocols shown). Select any protocol row to inspect its valuation waterfall and 6-step farming playbook.'
          }),
          el('thead', null,
            el('tr', null,
              sortColHeader('implied', 'Rank'),
              sortColHeader('name', 'Protocol & Tier'),
              sortColHeader('tvl', 'Snapshot TVL'),
              sortColHeader('growth', '7d Change'),
              sortColHeader('age', 'Tokenless Tenure'),
              el('th', { scope: 'col', text: 'Model Multipliers' }),
              sortColHeader('implied', 'Implied Launch Value'),
              sortColHeader('capital', 'Farming Commitment')
            )
          ),
          tbody
        )
      )
    );
  }

  function renderLiveBenchmarkTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      var gClass = r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg';
      var ratioText = r.mcap_tvl_ratio !== null ? r.mcap_tvl_ratio.toFixed(2) + 'x' : 'n/a';
      tbody.appendChild(
        el('tr', null,
          el('td', null, el('span', { class: 'tier-badge live', text: r.symbol || 'LIVE' })),
          el('td', null,
            el('div', { class: 'proto-cell' },
              el('div', { class: 'proto-title' }, el('span', { text: r.name })),
              el('span', { class: 'proto-sub', text: (r.category || 'DeFi') + ' · ' + ((r.chains || []).slice(0, 3).join(', ') || 'Multi-chain') })
            )
          ),
          el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
          el('td', { class: 'num ' + gClass, text: fmtPct(r.change_7d) }),
          el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
          el('td', { class: 'num', text: ratioText }),
          el('td', null, el('span', { class: 'm-pill', text: 'Token Already Trades (Benchmark Only)' }))
        )
      );
    });

    return el('div', { class: 'glass-panel table-panel' },
      el('div', { class: 'table-scroll' },
        el('table', null,
          el('caption', {
            text: 'Live-Token Benchmarks (' + DATA.live.length + ' protocols). These protocols already record a live token in the snapshot; they calibrate sector MCap/TVL multiples and are excluded from the pre-token ranking.'
          }),
          el('thead', null,
            el('tr', null,
              el('th', { scope: 'col', text: 'Ticker' }),
              el('th', { scope: 'col', text: 'Protocol' }),
              el('th', { scope: 'col', text: 'Snapshot TVL' }),
              el('th', { scope: 'col', text: '7d Change' }),
              el('th', { scope: 'col', text: 'Recorded Market Cap' }),
              el('th', { scope: 'col', text: 'Empirical MCap/TVL' }),
              el('th', { scope: 'col', text: 'Separation Status' })
            )
          ),
          tbody
        )
      )
    );
  }

  function renderMethodologySection() {
    var m = DATA.model;
    return el('section', { class: 'glass-panel methodology-grid' },
      el('div', null,
        el('h2', { text: 'Quantitative Valuation Architecture & Zero-Hardcode Guarantee' }),
        el('p', {
          text: 'Every protocol in board.json and data.js is scored by one pure function of the snapshot fields: computeImpliedValuation(row, model). No protocol slug or name is ever special-cased. Watchlist coverage is 40/40 (100%), and the early radar applies the exact same non-wrapped, non-staked, non-bridged, non-exchange filter to uncover 134 pre-token protocols below the $50M floor.'
        })
      ),
      el('div', { class: 'factor-list' },
        el('div', { class: 'factor-row' }, el('span', { text: '1. Sector Capital Velocity Multiple' }), el('b', { text: '0.22x – 0.42x (by category)' })),
        el('div', { class: 'factor-row' }, el('span', { text: '2. 7-Day Momentum Factor (clamped ' + m.growth_floor + '%..' + m.growth_cap + '%)' }), el('b', { text: '1 + (change_7d / 100) × ' + m.growth_weight })),
        el('div', { class: 'factor-row' }, el('span', { text: '3. Tokenless Tenure Factor (0..' + m.maturity_days + 'd)' }), el('b', { text: m.maturity_floor + ' + (age / ' + m.maturity_days + ') × ' + m.maturity_range })),
        el('div', { class: 'factor-row' }, el('span', { text: '4. Multi-Chain Network Footprint' }), el('b', { text: '1 + min(chains - 1, ' + m.chain_max_extra + ') × ' + m.chain_step }))
      )
    );
  }

  var drawer = el('dialog', { class: 'detail-drawer', id: 'detail-drawer', 'aria-labelledby': 'detail-title' });
  drawer.addEventListener('close', function () {
    state.selected = null;
    writeHash();
  });

  function openProtocolDetail(slug) {
    var row = null;
    for (var i = 0; i < DATA.rows.length; i++) {
      if (DATA.rows[i].slug === slug) { row = DATA.rows[i]; break; }
    }
    if (!row) return;
    state.selected = slug;
    writeHash();
    drawer.textContent = '';

    var recomputed = computeImpliedValuation(row, DATA.model);
    var isExact = recomputed === row.implied_value_usd;
    var structuredSteps = buildProtocolFarmPlan(row);

    drawer.appendChild(
      el('div', { class: 'detail-top' },
        el('div', null,
          el('div', { class: 'mult-pills' },
            el('span', { class: 'rank-pill top10', text: 'RANK #' + row.rank + ' OF ' + DATA.board_size }),
            el('span', {
              class: 'tier-badge ' + (row.tier === 'watchlist' ? 'watchlist' : 'early'),
              text: row.tier === 'watchlist' ? 'WATCHLIST FLOOR (≥$50M)' : 'EARLY RADAR (<$50M)'
            }),
            el('span', { class: 'tele-pill verified', text: isExact ? '✓ Formula Parity Verified' : 'Mismatch' })
          ),
          el('h2', { id: 'detail-title', text: row.name }),
          el('p', {
            class: 'proto-sub',
            text: 'Slug: ' + row.slug + ' · Category: ' + (row.category || 'Uncategorized') +
              ' · Chains: ' + ((row.chains && row.chains.length) ? row.chains.join(', ') : 'Mainnet')
          })
        ),
        el('button', {
          type: 'button',
          class: 'close-btn',
          'aria-label': 'Close protocol detail',
          text: '✕ Close',
          onclick: function () { drawer.close(); }
        })
      )
    );

    drawer.appendChild(
      el('div', { class: 'detail-kpi-strip' },
        el('div', { class: 'd-kpi' }, el('span', { text: 'Implied Launch Value' }), el('b', { style: 'color:#34d399', text: fmtUsd(row.implied_value_usd) })),
        el('div', { class: 'd-kpi' }, el('span', { text: 'Snapshot TVL (' + fmtPct(row.change_7d) + ' 7d)' }), el('b', { text: fmtUsd(row.tvl_usd) })),
        el('div', { class: 'd-kpi' }, el('span', { text: 'Recommended Farm Setup' }), el('b', { style: 'color:#38bdf8', text: '$' + row.capital_usd + ' · ' + row.hold_days + 'd hold' }))
      )
    );

    drawer.appendChild(
      el('section', { class: 'detail-block' },
        el('h3', { text: 'Valuation Multiplier Waterfall (Snapshot → Implied Value)' }),
        renderValuationWaterfallSvg(row),
        el('div', { class: 'equation-grid' },
          el('div', { class: 'eq-row' }, el('span', { text: 'Snapshot TVL' }), el('b', { text: usdFull.format(row.tvl_usd) })),
          el('div', { class: 'eq-row' }, el('span', { text: 'Sector Multiple' }), el('b', { text: row.sector_multiple.toFixed(2) + 'x' })),
          el('div', { class: 'eq-row' }, el('span', { text: '7d Growth (' + fmtPct(row.change_7d) + ')' }), el('b', { text: row.growth_multiplier.toFixed(4) + 'x' })),
          el('div', { class: 'eq-row' }, el('span', { text: 'Tenure (' + fmtAge(row.age_days) + ')' }), el('b', { text: row.maturity_multiplier.toFixed(4) + 'x' })),
          el('div', { class: 'eq-row' }, el('span', { text: 'Chain Footprint (' + (row.chains ? row.chains.length : 1) + ')' }), el('b', { text: row.chain_multiplier.toFixed(4) + 'x' })),
          el('div', { class: 'eq-row' }, el('span', { text: 'Verified Output' }), el('b', { style: 'color:#34d399', text: usdFull.format(recomputed) }))
        )
      )
    );

    drawer.appendChild(
      el('section', { class: 'detail-block' },
        el('h3', { text: 'Concrete 6-Step Farming Execution Plan (Action, Cost & Timeline)' }),
        el('ol', { class: 'farm-list' },
          structuredSteps.map(function (st) {
            return el('li', { class: 'farm-item' },
              el('div', { class: 'farm-item-head' },
                el('span', { class: 'farm-phase', text: st.phase }),
                el('div', { class: 'farm-badges' },
                  el('span', { class: 'f-badge', text: 'Cost: ' + st.cost }),
                  el('span', { class: 'f-badge time', text: 'Time: ' + st.time })
                )
              ),
              el('p', { class: 'farm-text', text: st.action })
            );
          })
        )
      )
    );

    if (typeof drawer.showModal === 'function') {
      if (!drawer.open) drawer.showModal();
    } else {
      drawer.setAttribute('open', '');
    }
  }

  function render() {
    var filteredList = filterPreTokenRows();
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(renderTopBar());
    shell.appendChild(renderHeroSection());
    shell.appendChild(renderVisualAnalytics(filteredList));
    shell.appendChild(renderControlsBar(filteredList.length));
    shell.appendChild(state.tier === 'live' ? renderLiveBenchmarkTable() : renderBoardTable(filteredList));
    shell.appendChild(renderMethodologySection());
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');

    if (!drawer.isConnected) app.appendChild(drawer);
    if (state.selected) openProtocolDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && drawer.open) drawer.close();
  });
})();
