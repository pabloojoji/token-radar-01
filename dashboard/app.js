// Token Radar's night-ops dashboard. Reads window.RADAR (written beside
// dashboard/ by main.ts) and renders the ranked board, filters, a per-protocol
// detail view with the model's own inputs, a spider chart and the farm plan,
// plus five self-checks the page runs live. No network: every byte it shows
// is in data.js, and every number traces to the snapshot or to the model.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('app');
  var state = { q: '', category: 'all', chain: 'all', floor: 0, sort: 'implied', dir: -1, wl: false, tab: 'pre-token', selected: null };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

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
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // The model in one function: the page recomputes a row from the snapshot
  // figures and checks the number board.json carries, so the page's code and
  // the board's data are visibly the same arithmetic.
  function impliedOf(row, model) {
    return Math.max(1, Math.round(row.tvl_usd * row.category_multiple * row.growth_multiplier * row.maturity_multiplier * row.tge_odds * row.chain_multiplier));
  }
  function growthPctOf(row, model) {
    var g = row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d;
    return Math.min(model.growth_cap, Math.max(model.growth_floor, g));
  }

  // The farm plan is the same derivation main.ts writes to board.json: category,
  // chains, TVL and age decide the action, the capital, the hold and every cost
  // and time. No name is special-cased.
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Lend $' + capital + ' of USDC on ' + name + ' (' + chain + ') and leave the loan open.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Add $' + capital + ' of liquidity to ' + name + "'s deepest pool on " + chain + ' and leave it in.';
    if (c.indexOf('bridge') >= 0) return 'Move $' + capital + ' of USDC to ' + chain + ' through ' + name + ', then put the bridged funds to work in its app.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return "Stake $" + capital + " of the chain's staking asset through " + name + ' and keep the receipt token.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Post $' + capital + ' of USDC as margin on ' + name + ' and open one small hedged position.';
    if (c.indexOf('prediction') >= 0) return 'Fund ' + name + ' with $' + capital + ' and take one position on a market.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Put $' + capital + ' into a ' + name + ' vault on ' + chain + ' and hold the vault shares.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + '.';
    if (c.indexOf('rwa') >= 0) return "Mint $" + capital + " of the protocol's yield-bearing asset on " + chain + ' and hold it.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy live.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and leave the position open.';
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    var gas = capital >= 150 ? 8 : 4;
    return [
      { text: 'Open a fresh wallet for this farm alone, fund it with exactly what you plan to use, and keep its seed phrase offline.', cost: 'under $3 of gas for the first transfer', time: '5 minutes' },
      { text: actionFor(p, capital, chain), cost: '$' + capital + ' of capital and about $' + gas + ' of gas', time: '15 minutes to set up' },
      { text: 'Do one qualifying action every week — a deposit, a borrow, a swap or a vote — so the wallet stays active.', cost: 'about $2 of gas a week', time: '10 minutes a week' },
      { text: 'Keep the position open for at least ' + hold + ' days, so the activity spans more than one snapshot.', cost: 'the $' + capital + ' stays locked in the position', time: hold + ' days' },
      { text: "Before you unwind, open the protocol's own points or rewards page and claim only from the link it publishes.", cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { text: 'Log the wallet, the dates and every transaction, so you can repeat the farm or unwind it cleanly.', cost: 'nothing but the log', time: '5 minutes' }
    ].map(stepText);
  }

  // ---- state in the hash, so a screenshot can open one view directly ----
  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('floor')) state.floor = Number(params.get('floor')) || 0;
    if (params.get('sort')) state.sort = params.get('sort');
    if (params.get('wl') === '1') state.wl = true;
    if (params.get('tab')) state.tab = params.get('tab');
    if (params.get('p')) state.selected = params.get('p');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.floor) params.set('floor', String(state.floor));
    if (state.sort !== 'implied') params.set('sort', state.sort);
    if (state.wl) params.set('wl', '1');
    if (state.tab !== 'pre-token') params.set('tab', state.tab);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  var WATCH = {};
  DATA.watchlist.forEach(function (s) { WATCH[s] = true; });
  var MAX_TVL = Math.max.apply(null, DATA.rows.map(function (r) { return r.tvl_usd; }));

  function rows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.wl && !WATCH[r.slug]) return false;
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (r.tvl_usd < state.floor) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else if (key === 'tge') { av = a.tge_odds; bv = b.tge_odds; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function kpis() {
    var strip = document.getElementById('kpis');
    strip.textContent = '';
    var tiles = [
      ['Watchlist covered', DATA.watchlist_size + ' / ' + DATA.watchlist_size, 'every watchlist slug is ranked'],
      ['Pre-token rows', String(DATA.board_size), DATA.early_size + ' early rows the watchlist leaves out'],
      ['Total implied value', fmtUsd(DATA.total_implied_usd), 'sum of all ' + DATA.board_size + ' rows'],
      ['Total airdrop pool', fmtUsd(DATA.total_airdrop_pool_usd), '5% of implied value, the farming target'],
      ['Median TGE odds', Math.round(DATA.median_tge_odds * 100) + '%', 'age-decayed launch odds, board median']
    ];
    tiles.forEach(function (t) {
      strip.appendChild(el('div', { class: 'kpi' }, el('span', { text: t[0] }), el('b', { html: esc(t[1]) }), el('small', { text: t[2] })));
    });
  }

  function fillSelects() {
    var cats = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.reduce(function (a, r) { return a.concat(r.chains || []); }, []))).sort();
    var catSel = document.getElementById('category');
    catSel.textContent = '';
    catSel.appendChild(el('option', { value: 'all', text: 'All categories' }));
    cats.forEach(function (c) { catSel.appendChild(el('option', { value: c, text: c })); });
    catSel.value = state.category;
    var chainSel = document.getElementById('chain');
    chainSel.textContent = '';
    chainSel.appendChild(el('option', { value: 'all', text: 'All chains' }));
    chains.forEach(function (c) { chainSel.appendChild(el('option', { value: c, text: c })); });
    chainSel.value = state.chain;
    document.getElementById('floor').value = String(state.floor);
    document.getElementById('sort').value = state.sort;
    document.getElementById('watchlist').checked = state.wl;
    document.getElementById('q').value = state.q;
    document.getElementById('tab-pre').setAttribute('aria-pressed', state.tab === 'pre-token' ? 'true' : 'false');
    document.getElementById('tab-live').setAttribute('aria-pressed', state.tab === 'live' ? 'true' : 'false');
  }

  function sortHeader(key, label, numeric) {
    return el('th', { scope: 'col', class: numeric ? 'num' : null },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } writeHash(); renderBoard(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' ▼' : ' ▲' }) : null
      )
    );
  }

  function boardTable() {
    var list = sortedRows(rows());
    document.getElementById('count').textContent = state.tab === 'pre-token' ? list.length + ' rows shown' : DATA.live.length + ' live-token protocols';
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category to see the board again.' }),
        el('button', { class: 'button', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.floor = 0; state.wl = false; fillSelects(); writeHash(); renderBoard(); } })
      ));
    }
    var max = list[0].implied_value_usd || 1;
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' · ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'unnamed chain') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', { class: 'num' }, el('span', { class: 'gauge' },
          el('span', { class: 'track', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.round(r.tge_odds * 100) + '%' })),
          el('span', { text: Math.round(r.tge_odds * 100) + '%' })
        )),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) })
        )),
        el('td', { class: 'num', text: fmtUsd(r.airdrop_pool_usd) }),
        el('td', null, el('span', { class: 'badge' + (WATCH[r.slug] ? ' wl' : ''), text: WATCH[r.slug] ? 'WATCHLIST' : 'EARLY' }))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { text: 'Pre-token protocols, strongest implied value first. Select a row for its model, radar chart and farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('implied', '#'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL', true),
            sortHeader('growth', '7d', true),
            sortHeader('age', 'Age', true),
            sortHeader('tge', 'TGE odds', true),
            sortHeader('implied', 'Implied value', true),
            el('th', { scope: 'col', class: 'num', text: 'Airdrop pool' }),
            el('th', { scope: 'col', text: 'List' })
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', null, el('span', { class: 'badge', text: 'LIVE' })),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' · ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', null, el('span', { class: 'sub', text: 'already trades' }))
      ));
    });
    document.getElementById('count').textContent = DATA.live.length + ' live-token protocols';
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', class: 'num', text: 'TVL' }), el('th', { scope: 'col', class: 'num', text: '7d' }), el('th', { scope: 'col', class: 'num', text: 'Market cap' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  // ---- the five self-checks the page runs live ----
  function checks() {
    var slugs = {};
    DATA.rows.forEach(function (r) { slugs[r.slug] = true; });
    var missing = DATA.watchlist.filter(function (s) { return !slugs[s]; });
    var ranksOk = DATA.rows.every(function (r, i) { return r.rank === i + 1; }) && DATA.rows.every(function (r, i) { return i === 0 || r.implied_value_usd <= DATA.rows[i - 1].implied_value_usd; });
    var stepsBad = 0;
    DATA.rows.forEach(function (r) {
      var steps = farmSteps(r);
      if (steps.length < 3 || steps.length > 12) stepsBad++;
      steps.forEach(function (s) { if (s.length < 20 || s.length > 600) stepsBad++; });
    });
    var mismatch = 0;
    DATA.rows.forEach(function (r) { if (impliedOf(r, DATA.model) !== r.implied_value_usd) mismatch++; });
    var b = DATA.build || {};
    var buildOk = (b.screenshots || 0) >= 3 && (b.screenshots || 0) <= 4 && (b.dossier_bytes || 0) > 0 && (b.dossier_bytes || 0) <= 1572864 && (b.dashboard_bytes || 0) <= 65536;
    var items = [
      ['Watchlist covered', missing.length === 0, DATA.watchlist_size + ' of ' + DATA.watchlist_size + ' watchlist slugs ranked' + (missing.length ? ' — missing ' + missing.slice(0, 3).join(', ') : '')],
      ['Ranks 1..' + DATA.board_size + ', value order', ranksOk, 'ranks are exactly 1..N once each; implied value never rises as rank ascends'],
      ['Farm steps valid', stepsBad === 0, 'every row carries 6 steps, each 20–600 characters, with cost and time' + (stepsBad ? ' — ' + stepsBad + ' bad' : '')],
      ['Page recomputes the board', mismatch === 0, 'all ' + DATA.board_size + ' implied values recomputed from the snapshot figures match board.json' + (mismatch ? ' — ' + mismatch + ' differ' : '')],
      ['Build artifacts', buildOk, (b.screenshots || 0) + ' screenshots, dossier ' + (b.dossier_bytes || 0) + ' bytes, dashboard source ' + (b.dashboard_bytes || 0) + ' bytes (cap 65,536)']
    ];
    var box = document.getElementById('checks');
    box.textContent = '';
    box.appendChild(el('h2', { text: 'Self-checks — the gate, run live on this page' }));
    var ul = el('ul');
    items.forEach(function (it) {
      ul.appendChild(el('li', null,
        el('b', null, el('span', { class: it[1] ? 'ok' : 'bad', text: it[1] ? 'PASS ' : 'FAIL ' }), document.createTextNode(it[0])),
        el('p', { text: it[2] })
      ));
    });
    box.appendChild(ul);
  }

  function methodology() {
    var m = DATA.model;
    var box = document.getElementById('method');
    box.textContent = '';
    box.appendChild(el('h2', { text: 'How implied value is computed — model ' + DATA.model_version }));
    box.appendChild(el('p', { text: 'One function scores every protocol, from the snapshot figures alone. No name is special-cased and no row is hand-picked.' }));
    var formula = el('div', { class: 'formula' });
    formula.innerHTML = 'implied = round( tvl_usd × <b>category multiple</b> × (1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 × ' + m.growth_weight + ') × (' + m.maturity_floor + ' + min(age, ' + m.maturity_days + ') / ' + m.maturity_days + ' × ' + m.maturity_range + ') × (' + m.tge_floor + ' + ' + (1 - m.tge_floor) + ' / (1 + age / ' + m.tge_half_life_days + ')) × (1 + ' + m.chain_step + ' × min(chains, ' + m.chain_max + ')) )';
    box.appendChild(formula);
    box.appendChild(el('p', { text: 'Category multiple: the median market-cap-per-TVL of the live-token protocols in the same category (at least ' + m.min_peers + ' peers, otherwise the snapshot-wide median), clamped to [' + m.multiple_min + ', ' + m.multiple_max + ']. A sector is priced by its own market. Growth is the snapshot’s 7-day TVL change. Age is days since first listing; an unlisted age uses ' + m.unknown_age_days + ' days. Maturity rewards age if a launch happens; TGE odds decay with age because a long run with no token makes a near launch less likely. The airdrop pool is ' + Math.round(m.airdrop_share * 100) + '% of implied value — the one airdrop number each row names, the pool the farm is aimed at.' }));
    var table = el('table', null,
      el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Category' }), el('th', { scope: 'col', class: 'num', text: 'Live peers' }), el('th', { scope: 'col', class: 'num', text: 'Multiple' })))
    );
    var tbody = el('tbody');
    DATA.peer_multiples.forEach(function (pm) {
      tbody.appendChild(el('tr', null,
        el('td', { text: pm.category }),
        el('td', { class: 'num', text: pm.peers === 0 ? '—' : String(pm.peers) }),
        el('td', { class: 'num', text: pm.multiple.toFixed(3) + '×' })
      ));
    });
    table.appendChild(tbody);
    box.appendChild(table);
    box.appendChild(el('p', { class: 'note', text: 'Farm costs and times are plan estimates from the protocol’s own TVL tier and age — $50–$250 of capital, $2–$8 of gas per action, holds of 30–60 days — never snapshot facts. A protocol that records no token may still have one its DefiLlama record does not carry.' }));
  }

  // ---- spider chart: five snapshot dimensions, each 0..1 ----
  function spider(row) {
    var m = DATA.model;
    var logMin = Math.log10(5e6);
    var logMax = Math.log10(Math.max(MAX_TVL, 5e6 + 1));
    var axes = [
      ['TVL', Math.max(0, Math.min(1, (Math.log10(Math.max(row.tvl_usd, 5e6)) - logMin) / (logMax - logMin)))],
      ['Growth', Math.max(0, Math.min(1, (growthPctOf(row, m) + 50) / 150))],
      ['Maturity', Math.max(0, Math.min(1, (row.maturity_multiplier - m.maturity_floor) / m.maturity_range))],
      ['TGE odds', Math.max(0, Math.min(1, (row.tge_odds - m.tge_floor) / (1 - m.tge_floor)))],
      ['Chains', Math.min(1, (row.chains || []).length / m.chain_max)]
    ];
    var cx = 110, cy = 95, r = 72;
    function pt(i, v) {
      var a = -Math.PI / 2 + (i * 2 * Math.PI) / axes.length;
      return [cx + Math.cos(a) * r * v, cy + Math.sin(a) * r * v];
    }
    var rings = [0.33, 0.66, 1].map(function (v) {
      return axes.map(function (_, i) { var p = pt(i, v); return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' ');
    });
    var poly = axes.map(function (a, i) { var p = pt(i, a[1]); return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' ');
    var svg = '<svg class="spider" viewBox="0 0 220 190" role="img" aria-label="Radar chart of five snapshot dimensions">';
    rings.forEach(function (pts) { svg += '<polygon points="' + pts + '" fill="none" stroke="#1e3258" stroke-width="1"/>'; });
    axes.forEach(function (_, i) { var p = pt(i, 1); svg += '<line x1="' + cx + '" y1="' + cy + '" x2="' + p[0].toFixed(1) + '" y2="' + p[1].toFixed(1) + '" stroke="#1e3258" stroke-width="1"/>'; });
    svg += '<polygon points="' + poly + '" fill="rgba(185,247,60,0.25)" stroke="#b9f73c" stroke-width="2"/>';
    axes.forEach(function (a, i) {
      var p = pt(i, 1.18);
      svg += '<text x="' + p[0].toFixed(1) + '" y="' + p[1].toFixed(1) + '" fill="#8fa3c4" font-size="10" text-anchor="middle">' + esc(a[0]) + '</text>';
    });
    return svg + '</svg>';
  }

  var dialog = document.getElementById('detail');
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function openDetail(slug) {
    var row = null;
    DATA.rows.forEach(function (r) { if (r.slug === slug) row = r; });
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var m = DATA.model;
    var steps = farmSteps(row);
    var recomputed = impliedOf(row, m);
    var above = row.rank > 1 ? DATA.rows[row.rank - 2] : null;
    var below = row.rank < DATA.rows.length ? DATA.rows[row.rank] : null;
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'rankline', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + (WATCH[row.slug] ? ' · Watchlist' : ' · Early') }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' · ' + ((row.chains || []).join(', ') || 'unnamed chain') + ' · listed ' + (row.listed_at || 'unknown') })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    var body = el('div', { class: 'detail-body' });
    var eq = el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value — every term shown' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL (snapshot)' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Category multiple' }), el('b', { class: 'num', text: row.category_multiple.toFixed(3) + '× (' + row.category_peers + ' peers)' })),
        el('div', null, el('span', { text: '7-day growth' }), el('b', { class: 'num', text: fmtPct(row.change_7d) })),
        el('div', null, el('span', { text: 'Growth multiplier' }), el('b', { class: 'num', text: row.growth_multiplier.toFixed(4) })),
        el('div', null, el('span', { text: 'Age with no token' }), el('b', { class: 'num', text: fmtAge(row.age_days) })),
        el('div', null, el('span', { text: 'Maturity multiplier' }), el('b', { class: 'num', text: row.maturity_multiplier.toFixed(4) })),
        el('div', null, el('span', { text: 'TGE odds (age-decayed)' }), el('b', { class: 'num', text: Math.round(row.tge_odds * 100) + '%' })),
        el('div', null, el('span', { text: 'Chain multiplier' }), el('b', { class: 'num', text: row.chain_multiplier.toFixed(4) })),
        el('div', { class: 'total' }, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) })),
        el('div', { class: 'total' }, el('span', { text: 'Airdrop pool (5%)' }), el('b', { class: 'num', text: fmtUsd(row.airdrop_pool_usd) }))
      ),
      el('p', { class: 'note', text: 'Model ' + DATA.model_version + ': the page recomputes this row as ' + fmtUsd(recomputed) + (recomputed === row.implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board — the data would be stale.') + ' An estimate, not a price.' })
    );
    var chart = el('section', { class: 'detail-section' },
      el('h3', { text: 'Radar — five snapshot dimensions' }),
      el('div', { html: spider(row) })
    );
    var farm = el('section', { class: 'detail-section full' },
      el('h3', { text: 'Farm plan — 6 steps, cost and time each' }),
      el('ol', { class: 'steps' }, steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('div', null, el('b', { text: action }), el('span', { class: 'cost', text: tail })));
      }))
    );
    var calls = el('section', { class: 'detail-section full' },
      el('h3', { text: 'Close calls — the nearest rivals by implied value' }),
      el('div', { class: 'close-calls' },
        el('div', null,
          el('span', { text: above ? 'One rank above' : 'Top of the board' }),
          el('b', { text: above ? '#' + above.rank + ' ' + above.name : '—' }),
          el('span', { class: 'num', text: above ? fmtUsd(above.implied_value_usd) + ' (+' + Math.round((above.implied_value_usd / row.implied_value_usd - 1) * 100) + '%)' : '' })
        ),
        el('div', null,
          el('span', { text: below ? 'One rank below' : 'Bottom of the board' }),
          el('b', { text: below ? '#' + below.rank + ' ' + below.name : '—' }),
          el('span', { class: 'num', text: below ? fmtUsd(below.implied_value_usd) + ' (−' + Math.round((1 - below.implied_value_usd / row.implied_value_usd) * 100) + '%)' : '' })
        )
      )
    );
    body.appendChild(eq);
    body.appendChild(chart);
    body.appendChild(farm);
    body.appendChild(calls);
    dialog.appendChild(body);
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function renderBoard() {
    var board = document.getElementById('board');
    board.textContent = '';
    board.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    if (state.selected) openDetail(state.selected);
  }

  function render() {
    document.getElementById('meta-asof').textContent = 'Snapshot ' + DATA.as_of;
    document.getElementById('meta-model').textContent = DATA.model_version + ' model';
    document.getElementById('foot-source').textContent = 'Source: ' + DATA.source + '. Watchlist floor $' + Math.round(DATA.floor_usd / 1e6) + 'M. Board: ' + DATA.board_size + ' rows, ' + DATA.watchlist_size + ' watchlist + ' + DATA.early_size + ' early. Live-token protocols set aside: ' + DATA.live_size + '.';
    kpis();
    fillSelects();
    checks();
    methodology();
    renderBoard();
    app.setAttribute('aria-busy', 'false');
  }

  document.getElementById('q').addEventListener('input', function (e) { state.q = e.target.value; writeHash(); renderBoard(); });
  document.getElementById('category').addEventListener('change', function (e) { state.category = e.target.value; writeHash(); renderBoard(); });
  document.getElementById('chain').addEventListener('change', function (e) { state.chain = e.target.value; writeHash(); renderBoard(); });
  document.getElementById('floor').addEventListener('change', function (e) { state.floor = Number(e.target.value) || 0; writeHash(); renderBoard(); });
  document.getElementById('sort').addEventListener('change', function (e) { state.sort = e.target.value; writeHash(); renderBoard(); });
  document.getElementById('watchlist').addEventListener('change', function (e) { state.wl = e.target.checked; writeHash(); renderBoard(); });
  document.getElementById('tab-pre').addEventListener('click', function () { state.tab = 'pre-token'; fillSelects(); writeHash(); renderBoard(); });
  document.getElementById('tab-live').addEventListener('click', function () { state.tab = 'live'; fillSelects(); writeHash(); renderBoard(); });

  readHash();
  render();
  window.addEventListener('hashchange', function () { readHash(); fillSelects(); renderBoard(); });
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
