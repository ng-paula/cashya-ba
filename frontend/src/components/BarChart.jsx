import { useState } from 'react';
import { formatPeso } from '../utils/budget.js';

/**
 * Daily spending: one bar per day (red when over), with the day's allowance as a marker line.
 * data: [{ label, spent, allowance, isToday, isFuture }]
 */
export default function BarChart({ data, height = 220 }) {
  const [hover, setHover] = useState(null);
  // Round the top of the scale up to a clean number so tick labels read nicely
  const rawMax = Math.max(...data.map((d) => Math.max(d.spent, d.allowance)), 1) * 1.1;
  const max = Math.ceil(rawMax / 200) * 200;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => max * t);

  return (
    <div className="bar-chart" style={{ height }}>
      <div className="bar-chart__axis">
        {[...ticks].reverse().map((t) => (
          <span key={t}>{formatPeso(t)}</span>
        ))}
      </div>
      <div className="bar-chart__plot">
        <div className="bar-chart__gridwrap">
          {ticks.map((t) => (
            <div key={t} className="bar-chart__grid" style={{ bottom: `${(t / max) * 100}%` }} />
          ))}
        </div>
        <div className="bar-chart__bars">
          {data.map((d, i) => (
            <div
              key={d.label}
              className={`bar-chart__group ${d.isFuture ? 'is-future' : ''} ${d.isToday ? 'is-today' : ''}`}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            >
              {hover === i && !d.isFuture && (
                <div className="bar-chart__tip" style={{ bottom: `${(Math.max(d.spent, d.allowance) / max) * 100 + 6}%` }}>
                  <strong>{formatPeso(d.spent)}</strong>
                  <span>
                    Day {d.label} · plan {formatPeso(d.allowance)}
                  </span>
                </div>
              )}
              {/* One bar per day; the plan is a short line across it */}
              {!d.isFuture && (
                <span
                  className={`bar bar--spent ${d.spent > d.allowance ? 'is-over' : ''}`}
                  style={{ height: `${(d.spent / max) * 100}%` }}
                />
              )}
              <span className="bar-chart__plan" style={{ bottom: `${(d.allowance / max) * 100}%` }} />
              <em className="bar-chart__label">{d.label}</em>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
