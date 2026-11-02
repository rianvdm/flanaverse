/**
 * The "appears in" strip: a row on the shared date axis with a poster thumb at
 * each work the entity appears in. Same axis everywhere so strips compare.
 */
import { html, type Raw } from '../lib/html';
import { model, workHref, ERAS } from '../data/model';
import './strip.css';

export const AXIS_FROM = 2011;
export const AXIS_TO = 2027;
export const xOfYear = (year: number, width: number) => ((year - AXIS_FROM) / (AXIS_TO - AXIS_FROM)) * width;
export const yearOf = (date: string) => Number(date.slice(0, 4)) + (Number(date.slice(5, 7) || 1) - 1) / 12;

export function appearsInStrip(slugs: string[], opts: { notes?: Record<string, string>; compact?: boolean } = {}): Raw {
  const works = slugs.map((s) => model.workBySlug.get(s)).filter((w) => w && w.year >= AXIS_FROM).map((w) => w!);
  const W = 1000, H = opts.compact ? 70 : 110;
  const thumbW = opts.compact ? 26 : 40, thumbH = thumbW * 1.5;
  const ticks = [];
  for (let y = AXIS_FROM; y <= AXIS_TO; y += 2) ticks.push(y);
  return html`<figure class="strip ${opts.compact ? 'strip--compact' : ''}">
    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true" class="strip__axis">
      ${ERAS.filter((e) => e.to >= AXIS_FROM).map((e) => html`<rect class="strip__era" x="${xOfYear(Math.max(e.from, AXIS_FROM), W)}" y="0" width="${xOfYear(Math.min(e.to + 1, AXIS_TO), W) - xOfYear(Math.max(e.from, AXIS_FROM), W)}" height="${H}"/>`)}
      <line class="strip__line" x1="0" x2="${W}" y1="${H - 18}" y2="${H - 18}"/>
      ${ticks.map((y) => html`<line class="strip__tick" x1="${xOfYear(y, W)}" x2="${xOfYear(y, W)}" y1="${H - 18}" y2="${H - 12}"/>`)}
      ${works.map((w) => html`<line class="strip__stem" x1="${xOfYear(yearOf(w.releaseDate), W)}" x2="${xOfYear(yearOf(w.releaseDate), W)}" y1="${H - 18}" y2="${H - 18 - thumbH * 0.2}"/>`)}
    </svg>
    <div class="strip__ticks" aria-hidden="true">${ticks.map((y) => html`<span style="left:${(xOfYear(y, W) / W) * 100}%">${y}</span>`)}</div>
    <ul class="strip__items">
      ${works.map((w) => html`<li class="strip__item" style="left:${(xOfYear(yearOf(w.releaseDate), W) / W) * 100}%">
        <a href="${workHref(w.slug)}" title="${w.title}${opts.notes?.[w.slug] ? ' — ' + opts.notes[w.slug] : ''}" style="width:${thumbW}px;height:${thumbH}px">
          ${w.poster ? html`<img src="${w.poster}" alt="${w.title}" loading="lazy">` : html`<span>${w.title}</span>`}
        </a>
      </li>`)}
    </ul>
  </figure>`;
}
