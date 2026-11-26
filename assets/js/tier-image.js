/* Картинка тир-листа: слоты и постеры рисуются на canvas, без библиотек.
   Постер с чужого сайта, который не разрешает рисовать себя на canvas (CORS), заменяется
   плашкой с названием — картинка сохраняется в любом случае. */
'use strict';

const TierImage = (() => {
  const W = 1200;
  const PAD = 32;
  const LABEL = 200;
  const GAP = 8;
  const ROW_GAP = 10;
  const ROW_PAD = 14;
  const HEAD = 104;
  const FOOT = 40;
  const MAX_PIXELS = 16e6;  // предел размера canvas в Safari; другие браузеры позволяют больше
  const FONT = 'Manrope, system-ui, sans-serif';
  const C = {
    bg: '#121418', panel: '#1c1f26', border: '#2a2f39', text: '#eceef2', muted: '#979eab', dim: '#68707d',
    good: '#3bb33b', mid: '#8a909b', bad: '#e5484d',
  };

  function loadImage(url) {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.referrerPolicy = 'no-referrer';
      const timer = setTimeout(() => resolve(null), 8000);
      img.onload = () => { clearTimeout(timer); resolve(img); };
      img.onerror = () => { clearTimeout(timer); resolve(null); };
      img.src = url;
    });
  }

  async function loadPosters(films) {
    const images = new Map();
    await Promise.all(films.filter((f) => f.poster).map(async (f) => {
      const img = await loadImage(CG.thumbUrl(f.poster)) || await loadImage(f.poster);
      if (img) images.set(f.id, img);
    }));
    return images;
  }

  async function fontsReady() {
    if (!document.fonts) return;
    await Promise.race([
      Promise.all(['800 28px Manrope', '700 16px Manrope', '600 13px Manrope'].map((f) => document.fonts.load(f))),
      new Promise((r) => setTimeout(r, 2000)),
    ]).catch(() => {});
  }

  function wrap(ctx, text, maxWidth, maxLines) {
    const fits = (s) => ctx.measureText(s).width <= maxWidth;
    // Слово длиннее строки переносится по буквам — как word-break на странице.
    const words = String(text).split(/\s+/).flatMap((word) => {
      const parts = [];
      let rest = word;
      while (rest && !fits(rest)) {
        let n = rest.length - 1;
        while (n > 1 && !fits(rest.slice(0, n))) n--;
        parts.push(rest.slice(0, n));
        rest = rest.slice(n);
      }
      if (rest) parts.push(rest);
      return parts;
    });
    const lines = [];
    let line = '';
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (fits(next) || !line) line = next;
      else {
        lines.push(line);
        line = word;
      }
    }
    if (line) lines.push(line);
    if (lines.length > maxLines) {
      lines.length = maxLines;
      let last = lines[maxLines - 1];
      while (last && !fits(`${last}…`)) last = last.slice(0, -1);
      lines[maxLines - 1] = `${last}…`;
    }
    return lines;
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
  }

  function drawPoster(ctx, film, img, x, y, pw, ph) {
    ctx.save();
    roundRect(ctx, x, y, pw, ph, 6);
    ctx.clip();
    if (img) {
      // object-fit: cover
      const scale = Math.max(pw / img.naturalWidth, ph / img.naturalHeight);
      const sw = pw / scale;
      const sh = ph / scale;
      ctx.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, x, y, pw, ph);
    } else {
      const hue = CG.hue(film.id);
      const grad = ctx.createLinearGradient(x, y, x + pw, y + ph);
      grad.addColorStop(0, `hsl(${hue} 45% 26%)`);
      grad.addColorStop(1, `hsl(${hue + 40} 40% 12%)`);
      ctx.fillStyle = grad;
      ctx.fillRect(x, y, pw, ph);
      const size = Math.max(8, Math.round(pw / 7));
      ctx.font = `800 ${size}px ${FONT}`;
      ctx.fillStyle = 'rgba(255,255,255,.9)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const lines = wrap(ctx, film.title, pw - 8, 4);
      const lh = size * 1.15;
      lines.forEach((l, i) => ctx.fillText(l, x + pw / 2, y + ph / 2 + (i - (lines.length - 1) / 2) * lh));
    }
    if (film.kp && pw >= 56) {
      ctx.font = `800 10px ${FONT}`;
      const label = film.kp.toFixed(1);
      const bw = ctx.measureText(label).width + 10;
      ctx.fillStyle = film.kp >= 7 ? C.good : film.kp < 5 ? C.bad : C.mid;
      roundRect(ctx, x + 4, y + 4, bw, 15, 4);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, x + 9, y + 12);
    }
    ctx.restore();
  }

  function layout(tiers) {
    const total = tiers.reduce((n, t) => n + t.items.length, 0);
    const pw = total > 400 ? 44 : total > 150 ? 56 : 72;
    const ph = pw * 1.5;
    const areaW = W - PAD * 2 - LABEL - ROW_PAD * 2;
    const perRow = Math.max(1, Math.floor((areaW + GAP) / (pw + GAP)));
    let y = HEAD;
    const rows = tiers.map((t) => {
      const lines = Math.max(1, Math.ceil(t.items.length / perRow));
      const h = Math.max(lines * ph + (lines - 1) * GAP + ROW_PAD * 2, 96);
      const row = { tier: t, y, h };
      y += h + ROW_GAP;
      return row;
    });
    return { total, pw, ph, perRow, rows, height: y - ROW_GAP + FOOT };
  }

  function draw(canvas, { tiers, byId, siteTitle }, images) {
    const L = layout(tiers);
    const scale = Math.min(2, Math.sqrt(MAX_PIXELS / (W * L.height)));
    canvas.width = Math.round(W * scale);
    canvas.height = Math.round(L.height * scale);
    const ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, L.height);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = C.text;
    ctx.font = `800 28px ${FONT}`;
    ctx.fillText('Тир-лист фильмов', PAD, 54);
    ctx.fillStyle = C.muted;
    ctx.font = `600 14px ${FONT}`;
    ctx.fillText(`${siteTitle} · ${new Date().toLocaleDateString('ru-RU')}`, PAD, 78);
    ctx.textAlign = 'right';
    ctx.fillText(CG.plural(L.total, 'фильм', 'фильма', 'фильмов'), W - PAD, 54);

    for (const { tier, y, h } of L.rows) {
      const x = PAD;
      const w = W - PAD * 2;
      ctx.save();
      roundRect(ctx, x, y, w, h, 14);
      ctx.fillStyle = C.panel;
      ctx.fill();
      ctx.clip();
      const grad = ctx.createLinearGradient(x, 0, x + LABEL, 0);
      grad.addColorStop(0, `${tier.color}2e`);
      grad.addColorStop(1, `${tier.color}00`);
      ctx.fillStyle = grad;
      ctx.fillRect(x, y, LABEL, h);
      ctx.fillStyle = tier.color;
      ctx.fillRect(x, y, 4, h);
      ctx.fillStyle = C.border;
      ctx.fillRect(x + LABEL, y, 1, h);
      ctx.restore();

      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.font = `800 17px ${FONT}`;
      ctx.fillStyle = C.text;
      const nameLines = wrap(ctx, tier.name, LABEL - 36, 3);
      nameLines.forEach((l, i) => ctx.fillText(l, x + 22, y + 30 + i * 21));
      ctx.font = `600 12.5px ${FONT}`;
      ctx.fillStyle = C.muted;
      ctx.fillText(CG.plural(tier.items.length, 'фильм', 'фильма', 'фильмов'), x + 22, y + 30 + nameLines.length * 21 + 2);

      if (!tier.items.length) {
        ctx.fillStyle = C.dim;
        ctx.font = `600 13px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('—', x + LABEL + (w - LABEL) / 2, y + h / 2);
        continue;
      }
      tier.items.forEach((id, i) => {
        const px = x + LABEL + ROW_PAD + (i % L.perRow) * (L.pw + GAP);
        const py = y + ROW_PAD + Math.floor(i / L.perRow) * (L.ph + GAP);
        drawPoster(ctx, byId.get(id), images.get(id), px, py, L.pw, L.ph);
      });
    }

    ctx.textAlign = 'right';
    ctx.textBaseline = 'alphabetic';
    ctx.font = `600 12px ${FONT}`;
    ctx.fillStyle = C.dim;
    ctx.fillText(siteTitle, W - PAD, L.height - 14);
  }

  const toBlob = (canvas) => new Promise((resolve, reject) => {
    try {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('пустой результат'))), 'image/png');
    } catch (err) {
      reject(err);
    }
  });

  // Возвращает { blob, fallback }: fallback — постеры пришлось заменить плашками.
  async function render(data) {
    const films = [...new Set(data.tiers.flatMap((t) => t.items))].map((id) => data.byId.get(id));
    const [images] = await Promise.all([loadPosters(films), fontsReady()]);
    const canvas = document.createElement('canvas');
    draw(canvas, data, images);
    try {
      return { blob: await toBlob(canvas), fallback: images.size < films.filter((f) => f.poster).length };
    } catch {
      // Холст «испачкан» чужой картинкой (например, страница открыта из file://) — рисуем без постеров.
      draw(canvas, data, new Map());
      return { blob: await toBlob(canvas), fallback: true };
    }
  }

  return { render };
})();
