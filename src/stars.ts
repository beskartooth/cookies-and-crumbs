const SVG_NS = 'http://www.w3.org/2000/svg';
const STAR_POINTS =
  '12,1.8 14.9,8.6 22.2,9.2 16.6,14 18.3,21.2 12,17.4 5.7,21.2 7.4,14 1.8,9.2 9.1,8.6';

/** A small star icon. Filled is gold; empty is an outline slot. */
export function starIcon(filled: boolean, className = 'star'): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', `${className} ${filled ? 'is-filled' : 'is-empty'}`);
  const poly = document.createElementNS(SVG_NS, 'polygon');
  poly.setAttribute('points', STAR_POINTS);
  poly.setAttribute('stroke-linejoin', 'round');
  svg.append(poly);
  return svg;
}

/** Three star slots, the first `count` filled. */
export function starRow(count: number, className = 'star'): SVGSVGElement[] {
  return [0, 1, 2].map((i) => starIcon(i < count, className));
}
