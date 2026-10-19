"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminCss = void 0;
// Shared design tokens + layout primitives. No CDN or client framework.
exports.adminCss = `
/* Tokens: change the theme here, not in individual pages. */
:root {
  color-scheme: light;
  --bg: #f5f7fb;
  --surface: #fff;
  --ink: #18253e;
  --muted: #627087;
  --line: #e4e9f2;
  --control-border: #8492a8;
  --control-bg: #fbfcff;
  --control-height: 44px;
  --brand-hover: #4034bc;
  --brand: #5146d8;
  --brand-soft: #eeedff;
  --good: #147259;
  --danger: #b13b48;
  --radius: 18px;
  --space: 24px;
  --shadow: 0 4px 24px #26365206;
}

/* Base and accessible controls. */
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 14px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif; }
a { color: var(--brand); text-decoration: none; }
a:hover { text-decoration: underline; }
:focus-visible { outline: 3px solid #a49bff; outline-offset: 3px; }
button,input,select { font: inherit; }
button,.button { background: var(--brand); color: #fff; border: 1px solid transparent; border-radius: 10px; padding: 10px 18px; min-height: var(--control-height); line-height: 22px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 8px; text-align: center; }
button:hover,.button:hover { background: var(--brand-hover); text-decoration: none; }
button:active,.button:active { background: #352a9f; }
.button-secondary { background: var(--surface); color: var(--ink); border-color: var(--control-border); }
.button-secondary:hover { background: var(--brand-soft); color: var(--brand); border-color: var(--brand); }
input:not([type=hidden]),select { border: 1px solid var(--control-border); background: var(--control-bg); color: var(--ink); border-radius: 9px; padding: 10px 12px; height: var(--control-height); max-width: 100%; width: 100%; min-width: 0; font-size: 14px; line-height: 22px; font-weight: 400; box-shadow: 0 1px 2px #18253e08; }
input::placeholder { color: #68768c; opacity: 1; font-style: normal; }
input:not([type=hidden]):hover,select:hover { border-color: #5a6980; background: var(--surface); }
input:focus,select:focus { border-color: var(--brand); background: var(--surface); outline: 3px solid #5146d82b; outline-offset: 1px; }
.select-control { position: relative; display: block; min-width: 0; }
.select-control select { appearance: none; padding-right: 40px; cursor: pointer; text-overflow: ellipsis; }
.select-control::after { content: ''; position: absolute; right: 16px; top: 17px; width: 8px; height: 8px; border-right: 2px solid #52617a; border-bottom: 2px solid #52617a; transform: rotate(45deg); pointer-events: none; }
.select-control:focus-within::after { border-color: var(--brand); }
@media(forced-colors:active) { .select-control select { appearance: auto; } .select-control::after { display: none; } }
h1,h2,p { margin: 0; }
h1 { font-size: clamp(24px,3vw,34px); letter-spacing: -1px; line-height: 1.2; }
h2 { font-size: 17px; letter-spacing: -.25px; }
code { font-family: ui-monospace,monospace; font-size: 11px; overflow-wrap: anywhere; }

/* Common shell. minmax(0,1fr) prevents long content expanding the page. */
.shell { max-width: 1600px; margin: auto; display: grid; grid-template-columns: 238px minmax(0,1fr); min-height: 100vh; }
.sidebar { padding: 32px 22px; background: var(--surface); border-right: 1px solid var(--line); display: flex; flex-direction: column; gap: 32px; }
.brand { display: flex; align-items: center; gap: 12px; font-weight: 750; font-size: 16px; }
.brand-icon { flex-shrink: 0; background: var(--brand); color: #fff; border-radius: 13px; width: 40px; height: 40px; display: grid; place-items: center; font-size: 23px; }
.eyebrow { font-size: 11px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; color: var(--muted); }
nav { display: grid; gap: 7px; }
nav a { padding: 12px 14px; border-radius: 10px; color: var(--muted); font-weight: 600; }
nav a:hover { background: var(--bg); color: var(--ink); text-decoration: none; }
nav a[aria-current=page] { background: var(--brand-soft); color: var(--brand); }
.sidebar-note { margin-top: auto; font-size: 12px; color: var(--muted); padding: 16px; background: var(--bg); border-radius: 12px; }
.main { padding: 36px clamp(18px,3vw,44px); min-width: 0; }
.topbar { display: flex; justify-content: space-between; align-items: center; gap: 16px; padding-bottom: 30px; border-bottom: 1px solid var(--line); margin-bottom: 30px; }
.status-dot { display: inline-block; width: 7px; height: 7px; background: #1f9d79; border-radius: 50%; margin-right: 6px; }
.subtitle { color: var(--muted); margin-top: 10px; max-width: 760px; }
.page-head { margin-bottom: 26px; }
.footer { margin-top: 24px; color: var(--muted); font-size: 12px; }

/* Reusable grids and cards. */
.stack { display: grid; gap: var(--space); }
.stats { display: grid; grid-template-columns: repeat(auto-fit,minmax(min(100%,180px),1fr)); gap: 16px; }
.load-grid { display: grid; grid-template-columns: repeat(auto-fit,minmax(min(100%,170px),1fr)); gap: 16px; margin-bottom: 16px; }
.load-value { font-size: 24px; font-weight: 700; font-variant-numeric: tabular-nums; margin-top: 6px; overflow-wrap: anywhere; }
.load-details { min-width: 170px; max-width: 240px; }
.load-details summary { cursor: pointer; color: var(--brand); font-weight: 600; min-height: 44px; padding: 8px 0; }
.load-details summary:hover { color: var(--brand-hover); }
.load-details[open] summary { margin-bottom: 6px; }
.load-details > div { padding: 10px; border: 1px solid var(--line); border-radius: 9px; background: var(--bg); font-size: 12px; }
.columns { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: var(--space); }
.card { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); box-shadow: var(--shadow); padding: 24px; min-width: 0; }
.card-head { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 20px; }
.card-head a { font-weight: 600; }
.metric-label { color: var(--muted); font-size: 13px; }
.metric-value { overflow-wrap: anywhere; font-variant-numeric: tabular-nums; font-size: 32px; font-weight: 750; letter-spacing: -1px; margin: 8px 0 4px; }
.metric-note,.muted { color: var(--muted); font-size: 12px; }
.notice { border-left: 3px solid #a49bff; padding: 12px 16px; background: var(--brand-soft); border-radius: 0 9px 9px 0; font-size: 12px; color: #514b79; }

/* Filters wrap independently of the number of fields. */
.filters { display: flex; align-items: flex-end; flex-wrap: wrap; gap: 16px; }
.filters label { display: grid; gap: 8px; flex: 1 1 180px; min-width: 0; font-size: 12px; line-height: 18px; font-weight: 600; color: #45536a; }
.filter-actions { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 10px; margin-left: auto; }
.filter-actions .button,.filter-actions button { flex: 1 0 auto; white-space: nowrap; }

/* Tables scroll inside the card, never on the whole document. */
.table-scroll { overflow: auto; max-width: 100%; }
table { width: 100%; border-collapse: collapse; text-align: left; font-size: 13px; }
th { font-size: 11px; text-transform: uppercase; letter-spacing: .6px; color: var(--muted); font-weight: 650; }
th,td { padding: 14px 12px; border-bottom: 1px solid var(--line); vertical-align: top; }
th:first-child,td:first-child { padding-left: 0; }
tbody tr:last-child td { border-bottom: 0; }
tbody tr:hover { background: #f8f9fd; }
td { font-variant-numeric: tabular-nums; }
.table-hint { display: none; margin-bottom: 12px; color: var(--muted); font-size: 12px; }
.user { min-width: 150px; max-width: 280px; overflow-wrap: anywhere; }
.request-id { min-width: 190px; max-width: 230px; }
.badge { display: inline-block; border-radius: 7px; background: var(--brand-soft); color: var(--brand); padding: 4px 8px; font-size: 11px; font-weight: 600; white-space: nowrap; }
.badge.error { background: #fff0f1; color: var(--danger); }
.badge.good { background: #eaf7f2; color: var(--good); }
.badge.neutral { background: #f0f2f6; color: var(--muted); }
.empty { text-align: center; padding: 36px 12px; color: var(--muted); }
.empty strong { display: block; color: var(--ink); font-size: 16px; margin-bottom: 8px; }
.pagination { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 20px; flex-wrap: wrap; }
.pagination a { display: inline-flex; align-items: center; min-height: 40px; padding: 7px 12px; border: 1px solid var(--control-border); border-radius: 8px; background: var(--surface); }
.pagination a:hover { background: var(--brand-soft); border-color: var(--brand); text-decoration: none; }

/* Native progress bars avoid inline styles and keep CSP strict. */
.bar-row { display: grid; grid-template-columns: minmax(0,1fr) auto; gap: 6px 16px; margin-top: 17px; }
.bar-label { overflow-wrap: anywhere; }
progress.bar { grid-column: 1/-1; height: 6px; background: var(--bg); border-radius: 10px; overflow: hidden; display: block; width: 100%; border: 0; appearance: none; }
progress.bar::-webkit-progress-bar { background: var(--bg); border-radius: 10px; }
progress.bar::-webkit-progress-value { background: var(--brand); border-radius: 10px; }
progress.bar::-moz-progress-bar { background: var(--brand); border-radius: 10px; }

/* Breakpoints shared across all screens. */
@media(min-width:1400px) {
  .stats { grid-template-columns: repeat(4,minmax(0,1fr)); }
}
@media(max-width:1000px) {
  .shell { grid-template-columns: 190px minmax(0,1fr); }
  .sidebar { padding: 28px 14px; }
  .columns { grid-template-columns: 1fr; }
  .main { padding: 28px 20px; }
}
@media(max-width:1200px) {
  .table-hint { display: block; }
}
@media(max-width:900px) {
  .shell { display: block; }
  .sidebar { border-right: 0; border-bottom: 1px solid var(--line); padding: 16px; gap: 16px; }
  .sidebar nav { display: flex; flex-wrap: wrap; gap: 4px; }
  .sidebar nav a { padding: 8px 12px; }
  .sidebar-note { display: none; }
  .main { padding: 22px 16px; }
  .topbar { padding-bottom: 18px; margin-bottom: 24px; }
  .topbar .muted { max-width: 170px; text-align: right; }
  .card { padding: 18px; }
  .stats { grid-template-columns: repeat(2,minmax(0,1fr)); gap: 10px; }
  .metric-value { font-size: 27px; }
  .metric-label { font-size: 12px; }
  .filters label { flex-basis: calc(50% - 16px); }
  .filter-actions { width: 100%; }
  .table-hint { display: block; }
  .table-scroll { padding-bottom: 10px; }
}
@media(max-width:480px) {
  .filters label { flex-basis: 100%; }
  input:not([type=hidden]),select { font-size: 16px; }
  .topbar { flex-wrap: wrap; }
  .topbar .muted { max-width: none; text-align: left; }
  .stats { grid-template-columns: repeat(auto-fit,minmax(min(100%,140px),1fr)); }
}
@media(prefers-reduced-motion:no-preference) {
  a,button,input,select { transition: background .15s,color .15s,border-color .15s; }
}
`;
