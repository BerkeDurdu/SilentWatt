import type { OverviewData, SeriesPoint } from '../../shared/types';
import { signedPct } from '../format';
import { useI18n } from '../i18n';

export function CaseChart({ series, onset, deviation, title }: { series: SeriesPoint[]; onset: number; deviation: number; title: string }) {
  const { t } = useI18n();
  const W = 680, H = 250;
  const m = { l: 44, r: 90, t: 16, b: 32 };
  const values = series.flatMap((p) => [p.lo, p.hi, p.act]);
  const lo = Math.floor(Math.min(...values) / 5) * 5;
  const hi = Math.ceil(Math.max(...values) / 5) * 5;
  const step = hi - lo > 30 ? 10 : 5;
  const x = (d: number) => m.l + ((d - 1) / 29) * (W - m.l - m.r);
  const y = (v: number) => m.t + ((hi - v) / (hi - lo)) * (H - m.t - m.b);
  const line = (pts: SeriesPoint[], key: 'act' | 'ref') => 'M' + pts.map((p) => `${x(p.d)},${y(p[key])}`).join('L');
  const band = 'M' + series.map((p) => `${x(p.d)},${y(p.hi)}`).join('L') + 'L' + [...series].reverse().map((p) => `${x(p.d)},${y(p.lo)}`).join('L') + 'Z';
  const ticks: number[] = [];
  for (let v = lo; v <= hi; v += step) ticks.push(v);
  const last = series[series.length - 1];
  const onsetX = x(onset - 0.5);
  const refY = y(last.ref);
  const actY = y(last.act);
  const refLabelY = Math.abs(refY - actY) < 16 ? (last.act > last.ref ? refY + 16 : refY - 10) : refY + 4;

  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title}>
      <rect x={onsetX} y={m.t} width={x(30) - onsetX} height={H - m.t - m.b} fill="var(--amber-soft)" />
      {ticks.map((v) => (
        <g key={v}>
          <line x1={m.l} x2={W - m.r} y1={y(v)} y2={y(v)} stroke="var(--line)" />
          <text x={m.l - 8} y={y(v) + 4} textAnchor="end">{v}</text>
        </g>
      ))}
      {[1, 8, 15, 22, 29].map((d) => (
        <text key={d} x={x(d)} y={H - 10} textAnchor="middle">{series[d - 1].label}</text>
      ))}
      <text x={m.l - 8} y={m.t - 4} textAnchor="end">kWh</text>
      <path d={band} fill="var(--brand-band)" />
      <path d={line(series, 'ref')} fill="none" stroke="var(--brand)" strokeWidth="1.8" strokeDasharray="4 4" />
      <line x1={onsetX} x2={onsetX} y1={m.t} y2={H - m.b} stroke="var(--amber)" strokeWidth="1.5" />
      <text x={onsetX + 6} y={m.t + 12} className="t-amber">{t('onset')}</text>
      <path d={line(series.filter((p) => p.d <= onset - 1), 'act')} fill="none" stroke="var(--ink)" strokeWidth="2.2" strokeLinejoin="round" />
      <path d={line(series.filter((p) => p.d >= onset - 1), 'act')} fill="none" stroke="var(--amber)" strokeWidth="2.6" strokeLinejoin="round" />
      <circle cx={x(30)} cy={actY} r="4.5" fill="var(--amber)" stroke="var(--surface)" strokeWidth="2" />
      <text x={x(30) + 10} y={actY + 5} className="t-amber t-big">{signedPct(deviation)}</text>
      <text x={x(30) + 10} y={refLabelY} className="t-brand">{t('lgReference')}</text>
    </svg>
  );
}

export function Sparkline({ act, ref, onset, closed }: { act: number[]; ref: number[]; onset: number; closed: boolean }) {
  const W = 96, H = 26;
  const all = [...act, ...ref];
  const lo = Math.min(...all), hi = Math.max(...all);
  const x = (i: number) => 2 + (i / 29) * (W - 6);
  const y = (v: number) => 3 + ((hi - v) / (hi - lo || 1)) * (H - 6);
  const path = (vals: number[], from: number, to: number) =>
    'M' + vals.slice(from, to).map((v, i) => `${x(from + i)},${y(v)}`).join('L');
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
      <path d={path(ref, 0, 30)} fill="none" stroke="var(--brand)" strokeWidth="1" strokeDasharray="2 2" opacity=".8" />
      <path d={path(act, 0, onset - 1)} fill="none" stroke="var(--ink-2)" strokeWidth="1.4" />
      <path d={path(act, onset - 2, 30)} fill="none" stroke={closed ? 'var(--muted)' : 'var(--amber)'} strokeWidth="1.8" />
    </svg>
  );
}

export function WeeklyChart({ weeks }: { weeks: OverviewData['weeks'] }) {
  const { t } = useI18n();
  const W = 600, H = 220;
  const m = { l: 34, r: 10, t: 14, b: 30 };
  const max = Math.max(10, Math.ceil(Math.max(...weeks.map((w) => w.verified + w.dismissed + w.open)) / 5) * 5);
  const bw = (W - m.l - m.r) / weeks.length;
  const y = (v: number) => m.t + ((max - v) / max) * (H - m.t - m.b);
  const ticks = [0, max / 2, max];

  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('weekly')}>
      {ticks.map((v) => (
        <g key={v}>
          <line x1={m.l} x2={W - m.r} y1={y(v)} y2={y(v)} stroke="var(--line)" />
          <text x={m.l - 8} y={y(v) + 4} textAnchor="end">{v}</text>
        </g>
      ))}
      {weeks.map((w, i) => {
        const x0 = m.l + i * bw + bw * 0.2;
        const width = bw * 0.6;
        let base = 0;
        const segments = ([[w.verified, 'var(--brand)'], [w.dismissed, 'var(--line-2)'], [w.open, 'var(--amber)']] as const)
          .filter(([v]) => v > 0)
          .map(([v, color]) => {
            const rect = <rect key={color} x={x0} y={y(base + v)} width={width} height={y(base) - y(base + v) - 1} fill={color} rx="1" />;
            base += v;
            return rect;
          });
        return (
          <g key={w.week}>
            <title>{t('weekTooltip', { w: w.week, v: w.verified, d: w.dismissed, o: w.open })}</title>
            {segments}
            <text x={x0 + width / 2} y={H - 10} textAnchor="middle">{t('weekPrefix')}{w.week}</text>
          </g>
        );
      })}
    </svg>
  );
}
