import type { EvidenceSeriesPoint } from '../../shared/evidence';
import type { DailyPoint } from '../../shared/types';
import { getLang, useI18n } from '../i18n';
import { num, shortDay } from '../format';

type Dot = { i: number; v: number };

/**
 * Splits a series into runs of consecutive values. A missing value ends a run, so the line breaks
 * there instead of being drawn through 0: null means "not computed", never zero.
 */
function runs(values: (number | null)[], from = 0, to = values.length - 1): Dot[][] {
  const out: Dot[][] = [];
  let current: Dot[] = [];
  for (let i = Math.max(0, from); i <= Math.min(values.length - 1, to); i++) {
    const v = values[i];
    if (v === null) {
      if (current.length) out.push(current);
      current = [];
    } else {
      current.push({ i, v });
    }
  }
  if (current.length) out.push(current);
  return out;
}

/** A 0-based axis whose top is a round number just above the largest value. */
function axis(values: (number | null)[]) {
  const max = Math.max(0, ...values.filter((v): v is number => v !== null));
  if (max === 0) return { top: 1, ticks: [0, 1] };
  const raw = max / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((k) => k * pow).find((s) => s >= raw)!;
  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= top + step / 2; v += step) ticks.push(v);
  return { top, ticks };
}

const tick = (v: number) => num(v, v < 10 && !Number.isInteger(v) ? 1 : 0);

function Hatch({ id }: { id: string }) {
  return (
    <defs>
      <pattern id={id} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="6" height="6" fill="var(--sunk)" />
        <line x1="0" y1="0" x2="0" y2="6" stroke="var(--line-2)" strokeWidth="2" />
      </pattern>
    </defs>
  );
}

/** The replay month, one point per local day: measured unit-hours against the model reference. */
export function DailyChart({ daily, onset, last, title }: { daily: DailyPoint[]; onset: string; last: string; title: string }) {
  const { t } = useI18n();
  const W = 680, H = 260;
  const m = { l: 48, r: 14, t: 26, b: 32 };
  const observed = daily.map((d) => d.observed_unit_hours);
  const reference = daily.map((d) => d.reference_unit_hours);
  const { top, ticks } = axis([...observed, ...reference]);
  const bw = (W - m.l - m.r) / daily.length;
  const x = (i: number) => m.l + (i + 0.5) * bw;
  const y = (v: number) => m.t + ((top - v) / top) * (H - m.t - m.b);
  const path = (run: Dot[]) => 'M' + run.map((p) => `${x(p.i)},${y(p.v)}`).join('L');
  const from = daily.findIndex((d) => d.local_date === onset);
  const to = daily.findIndex((d) => d.local_date === last);
  // The onset label and the unit caption share the top line; they take opposite ends.
  const onsetRight = from > daily.length / 2;

  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title}>
      <Hatch id="sw-hatch-daily" />
      {from >= 0 && to >= from && (
        <>
          <rect x={m.l + from * bw} y={m.t} width={(to - from + 1) * bw} height={H - m.t - m.b} fill="var(--amber-soft)" />
          <text x={onsetRight ? m.l + (to + 1) * bw : m.l + from * bw} y={m.t - 8} textAnchor={onsetRight ? 'end' : 'start'} className="t-amber">
            {t('onset')} · {shortDay(onset)}
          </text>
        </>
      )}
      {daily.map((d, i) => !d.scored && (
        <rect key={d.local_date} x={m.l + i * bw} y={m.t} width={bw} height={H - m.t - m.b} fill="url(#sw-hatch-daily)">
          <title>{shortDay(d.local_date)} · {d.notScoredLabel}</title>
        </rect>
      ))}
      {ticks.map((v) => (
        <g key={v}>
          <line x1={m.l} x2={W - m.r} y1={y(v)} y2={y(v)} stroke="var(--line)" />
          <text x={m.l - 8} y={y(v) + 4} textAnchor="end">{tick(v)}</text>
        </g>
      ))}
      {daily.map((d, i) => i % 7 === 0 && (
        <text key={d.local_date} x={x(i)} y={H - 10} textAnchor="middle">{shortDay(d.local_date)}</text>
      ))}
      <text x={onsetRight ? m.l : W - m.r} y={m.t - 8} textAnchor={onsetRight ? 'start' : 'end'}>{t('unitHours')}</text>
      {runs(reference).map((run) => (
        <path key={run[0].i} d={path(run)} fill="none" stroke="var(--brand)" strokeWidth="1.8" strokeDasharray="4 4" />
      ))}
      {runs(observed).map((run) => (
        <path key={run[0].i} d={path(run)} fill="none" stroke="var(--ink)" strokeWidth="2.2" strokeLinejoin="round" />
      ))}
      {daily.map((d, i) => d.observed_unit_hours !== null && (
        <circle
          key={d.local_date} cx={x(i)} cy={y(d.observed_unit_hours)} r={d.flagged ? 4 : 2}
          fill={d.flagged ? 'var(--amber)' : 'var(--ink)'} stroke={d.flagged ? 'var(--surface)' : 'none'} strokeWidth="1.5"
        />
      ))}
    </svg>
  );
}

const AUSTIN = 'America/Chicago';

/** The 15-minute readings around the case: measured value, model reference and the calibrated band. */
export function SeriesChart({ series, title }: { series: EvidenceSeriesPoint[]; title: string }) {
  const { t } = useI18n();
  const W = 680, H = 240;
  const m = { l: 48, r: 14, t: 26, b: 32 };
  const observed = series.map((p) => p.observed);
  const reference = series.map((p) => p.reference);
  const upper = series.map((p) => p.upper);
  const { top, ticks } = axis([...observed, ...upper]);
  const x = (i: number) => m.l + (i / Math.max(1, series.length - 1)) * (W - m.l - m.r);
  const y = (v: number) => m.t + ((top - v) / top) * (H - m.t - m.b);
  const path = (run: Dot[]) => 'M' + run.map((p) => `${x(p.i)},${y(p.v)}`).join('L');

  // The band needs both bounds; it breaks wherever either is missing.
  const banded = series.map((p) => (p.lower === null || p.upper === null ? null : p.upper));
  const bands = runs(banded).map((run) =>
    'M' + run.map((p) => `${x(p.i)},${y(p.v)}`).join('L') + 'L' + [...run].reverse().map((p) => `${x(p.i)},${y(series[p.i].lower!)}`).join('L') + 'Z');

  // Local days in Austin: where each one starts, for the separators and labels.
  const dayOf = new Intl.DateTimeFormat('en-CA', { timeZone: AUSTIN, year: 'numeric', month: '2-digit', day: '2-digit' });
  const label = new Intl.DateTimeFormat(getLang() === 'tr' ? 'tr-TR' : 'en-GB', { timeZone: AUSTIN, day: 'numeric', month: 'short' });
  const days: { start: number; end: number; text: string }[] = [];
  let previous = '';
  series.forEach((p, i) => {
    const date = new Date(p.ts_utc);
    const key = dayOf.format(date);
    if (key !== previous) days.push({ start: i, end: i, text: label.format(date) });
    else days[days.length - 1].end = i;
    previous = key;
  });
  const every = Math.ceil(days.length / 8);

  // Spans the detector could not score, e.g. outside the training temperature range.
  const unscored = runs(series.map((p) => (p.scored ? null : 1)));

  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title}>
      <Hatch id="sw-hatch-series" />
      {unscored.map((run) => (
        <rect key={run[0].i} x={x(run[0].i)} y={m.t} width={Math.max(1, x(run[run.length - 1].i) - x(run[0].i))} height={H - m.t - m.b} fill="url(#sw-hatch-series)">
          <title>{t('lgNotScored')}</title>
        </rect>
      ))}
      {ticks.map((v) => (
        <g key={v}>
          <line x1={m.l} x2={W - m.r} y1={y(v)} y2={y(v)} stroke="var(--line)" />
          <text x={m.l - 8} y={y(v) + 4} textAnchor="end">{tick(v)}</text>
        </g>
      ))}
      {days.map((d, i) => (
        <g key={d.start}>
          {i > 0 && <line x1={x(d.start)} x2={x(d.start)} y1={m.t} y2={H - m.b} stroke="var(--line)" />}
          {i % every === 0 && <text x={(x(d.start) + x(d.end)) / 2} y={H - 10} textAnchor="middle">{d.text}</text>}
        </g>
      ))}
      <text x={W - m.r} y={m.t - 8} textAnchor="end">{t('unitSource')}</text>
      {bands.map((d, i) => <path key={i} d={d} fill="var(--brand-band)" />)}
      {runs(reference).map((run) => (
        <path key={run[0].i} d={path(run)} fill="none" stroke="var(--brand)" strokeWidth="1.4" strokeDasharray="4 4" />
      ))}
      {runs(observed).map((run) => (
        <path key={run[0].i} d={path(run)} fill="none" stroke="var(--ink)" strokeWidth="1.5" strokeLinejoin="round" />
      ))}
    </svg>
  );
}

/** The month at a glance in a table row. Gaps stay gaps; the case window is the amber part. */
export function Sparkline({ observed, reference, from, to, muted }: { observed: (number | null)[]; reference: (number | null)[]; from: number; to: number; muted: boolean }) {
  const W = 96, H = 26;
  const all = [...observed, ...reference].filter((v): v is number => v !== null);
  const lo = Math.min(...all), hi = Math.max(...all);
  const x = (i: number) => 2 + (i / Math.max(1, observed.length - 1)) * (W - 6);
  const y = (v: number) => 3 + ((hi - v) / (hi - lo || 1)) * (H - 6);
  const path = (run: Dot[]) => 'M' + run.map((p) => `${x(p.i)},${y(p.v)}`).join('L');
  const inCase = from >= 0 && to >= from;
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
      {runs(reference).map((run) => (
        <path key={`r${run[0].i}`} d={path(run)} fill="none" stroke="var(--brand)" strokeWidth="1" strokeDasharray="2 2" opacity=".8" />
      ))}
      {runs(observed).map((run) => (
        <path key={`o${run[0].i}`} d={path(run)} fill="none" stroke="var(--ink-2)" strokeWidth="1.4" />
      ))}
      {inCase && runs(observed, from - 1, to).map((run) => (
        <path key={`c${run[0].i}`} d={path(run)} fill="none" stroke={muted ? 'var(--muted)' : 'var(--amber)'} strokeWidth="1.8" />
      ))}
    </svg>
  );
}
