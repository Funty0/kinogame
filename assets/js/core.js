/* Общее для всех страниц: данные фильмов, сохранения, постеры, карточка фильма, трейлер, окна. */
'use strict';

const CG = (() => {
  // --- данные ----------------------------------------------------------------
  // assets/data.js (tools/build_data.py): seed (8 hex) + base64(XOR(deflate(JSON))).

  function unmask(raw) {
    let s = parseInt(raw.slice(0, 8), 16) >>> 0;
    const bin = atob(raw.slice(8));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) {
      s = (s ^ (s << 13)) >>> 0;
      s = (s ^ (s >>> 17)) >>> 0;
      s = (s ^ (s << 5)) >>> 0;
      out[i] = bin.charCodeAt(i) ^ (s & 255);
    }
    return out;
  }

  async function inflate(bytes) {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new TextDecoder().decode(await new Response(stream).arrayBuffer());
  }

  let loading = null;
  function load() {
    loading ??= (async () => {
      const raw = self.CGD;
      if (typeof raw !== 'string') throw new Error('Нет данных: соберите assets/data.js (tools/build_data.py).');
      delete self.CGD;
      const d = JSON.parse(await inflate(unmask(raw)));
      const films = d.f.map((r) => ({
        id: r[0], title: r[1], original: r[2], year: r[3], kind: r[4], kp: r[5], imdb: r[6],
        genres: r[7].map((i) => d.g[i]), countries: r[8].map((i) => d.c[i]),
        duration: r[9], poster: r[10], trailer: r[11],
      }));
      return { films, byId: new Map(films.map((f) => [f.id, f])), title: d.t };
    })();
    return loading;
  }

  // --- сохранения --------------------------------------------------------------

  let storageWarned = false;
  const store = {
    get(key, fallback = null) {
      try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
      } catch {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
      } catch {
        if (!storageWarned) {
          storageWarned = true;
          toast('Браузер не даёт сохранять прогресс — изменения пропадут после перезагрузки', { timeout: 8000 });
        }
        return false;
      }
    },
  };

  const KEYS = { tier: 'kinogames:tier:v1', battle: 'kinogames:battle:v1', battleHistory: 'kinogames:battle:history:v1' };

  // --- DOM ---------------------------------------------------------------------

  function h(tag, props, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') for (const [p, x] of Object.entries(v)) el.style.setProperty(p, x);
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'html') el.innerHTML = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of children.flat(Infinity)) {
      if (c == null || c === false) continue;
      el.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return el;
  }

  const ICONS = {
    play: '<path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" fill="currentColor" stroke="none"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>',
    undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    up: '<path d="m6 15 6-6 6 6"/>',
    down: '<path d="m6 9 6 6 6-6"/>',
    restore: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
    more: '<circle cx="5" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="19" cy="12" r="1.6" fill="currentColor"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    film: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4"/>',
    layers: '<path d="M4 6h16M4 12h10M4 18h6"/>',
    trophy: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4Z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>',
    external: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16v4Z"/>',
    download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
    image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>',
    upload: '<path d="M12 16V5M7 10l5-5 5 5M5 20h14"/>',
    eyeOff: '<path d="M3 3l18 18M10.6 5.1A9.7 9.7 0 0 1 12 5c5 0 8.5 4.5 9.5 7a13 13 0 0 1-2.7 3.9M6.6 6.6A13.3 13.3 0 0 0 2.5 12c1 2.5 4.5 7 9.5 7a9.6 9.6 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
    shuffle: '<path d="M16 4h4v4M4 20 20 4M20 16v4h-4M15 15l5 5M4 4l5 5"/>',
  };
  function icon(name, size = 18) {
    const span = document.createElement('span');
    span.style.display = 'inline-flex';
    span.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" `
      + `stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;
    return span.firstChild;
  }

  // --- постер ----------------------------------------------------------------

  function hue(id) {
    let x = 0;
    for (const ch of id) x = (x * 31 + ch.charCodeAt(0)) >>> 0;
    return x % 360;
  }

  // Уменьшенная копия постера там, где CDN это умеет: меньше трафика в сетке из сотен карточек.
  function thumbUrl(url) {
    if (/avatars\.mds\.yandex\.net\/get-kinopoisk-image\//.test(url)) return url.replace(/\/[^/]+$/, '/300x450');
    if (/image\.tmdb\.org\/t\/p\/[^/]+\//.test(url)) return url.replace(/\/t\/p\/[^/]+\//, '/t/p/w342/');
    return url;
  }

  function placeholder(film) {
    return h('div', { class: 'poster-ph', style: { '--h': hue(film.id) } }, film.title);
  }

  function poster(film, { full = false } = {}) {
    if (!film.poster) return placeholder(film);
    const src = full ? film.poster : thumbUrl(film.poster);
    const img = h('img', {
      class: 'poster', src, alt: '', loading: 'lazy', decoding: 'async', draggable: 'false', referrerpolicy: 'no-referrer',
    });
    img.addEventListener('error', () => {
      if (img.src !== film.poster && src !== film.poster) img.src = film.poster;
      else img.replaceWith(placeholder(film));
    });
    return img;
  }

  // --- сведения о фильме -------------------------------------------------------

  const fmt = (v) => v.toFixed(1);
  const rateClass = (v) => (v >= 7 ? 'good' : v < 5 ? 'bad' : '');

  function duration(min) {
    if (!min) return null;
    return min >= 60 ? `${Math.floor(min / 60)} ч ${min % 60 ? `${min % 60} мин` : ''}`.trim() : `${min} мин`;
  }

  function rates(film) {
    return h('div', { class: 'film-rates' },
      film.kp ? h('span', { class: `rate ${rateClass(film.kp)}`, title: 'Рейтинг Кинопоиска' }, h('small', null, 'КП'), fmt(film.kp)) : null,
      film.imdb ? h('span', { class: 'rate imdb', title: 'Рейтинг IMDb' }, h('small', null, 'IMDb'), fmt(film.imdb)) : null,
      !film.kp && !film.imdb ? h('span', { class: 'meta' }, 'Без оценки') : null);
  }

  function info(film, { titleTag = 'h3' } = {}) {
    const meta = [film.countries.slice(0, 2).join(', '), duration(film.duration)].filter(Boolean).join(' · ');
    return [
      h('div', { class: 'film-head' }, h('span', { class: 'badge' }, film.kind), film.year ? h('span', { class: 'meta' }, film.year) : null),
      h(titleTag, { class: 'film-title' }, film.title),
      film.original ? h('div', { class: 'film-orig' }, film.original) : null,
      rates(film),
      film.genres.length ? h('div', { class: 'genres' }, film.genres.slice(0, 5).map((g) => h('span', null, g))) : null,
      meta ? h('div', { class: 'meta' }, meta) : null,
    ];
  }

  // --- трейлер -----------------------------------------------------------------

  function embedUrl(url) {
    let m;
    if ((m = url.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{6,})/))) {
      return `https://www.youtube-nocookie.com/embed/${m[1]}?autoplay=1&rel=0`;
    }
    if ((m = url.match(/(?:vk\.com|vkvideo\.ru)\/video(-?\d+)_(\d+)/))) {
      return `https://vkvideo.ru/video_ext.php?oid=${m[1]}&id=${m[2]}&hd=2&autoplay=1`;
    }
    if (/(?:vk\.com|vkvideo\.ru)\/video_ext\.php/.test(url)) return url.includes('autoplay') ? url : `${url}&autoplay=1`;
    if ((m = url.match(/rutube\.ru\/video\/([\w]+)/))) return `https://rutube.ru/play/embed/${m[1]}`;
    if (/widgets\.kinopoisk\.ru\//.test(url)) return url;
    return null;
  }

  function searchUrl(film) {
    return `https://www.youtube.com/results?search_query=${encodeURIComponent(`${film.title} ${film.year || ''} трейлер`)}`;
  }

  function openTrailer(film) {
    const embed = film.trailer ? embedUrl(film.trailer) : null;
    const player = h('div', { class: 'player' });
    if (embed) {
      player.append(h('iframe', {
        src: embed, allow: 'autoplay; encrypted-media; fullscreen; picture-in-picture', allowfullscreen: true,
        referrerpolicy: 'strict-origin-when-cross-origin', title: `Трейлер: ${film.title}`,
      }));
    } else {
      player.append(h('div', { class: 'player-empty' },
        h('b', null, film.trailer ? 'Этот трейлер нельзя встроить на страницу' : 'Трейлера нет в базе'),
        film.trailer ? 'Откройте его на сайте площадки.' : 'Можно поискать его на YouTube.',
        h('a', { class: 'btn primary', href: film.trailer || searchUrl(film), target: '_blank', rel: 'noopener noreferrer' },
          icon('external', 16), film.trailer ? 'Открыть трейлер' : 'Искать на YouTube')));
    }
    const links = h('div', { class: 'player-links' },
      h('span', null, [film.kind, film.year].filter(Boolean).join(' · ')),
      embed ? h('a', { href: film.trailer, target: '_blank', rel: 'noopener noreferrer' }, 'Открыть в новой вкладке ↗') : null);
    modal({ title: film.title, wide: true, body: [player, links] });
  }

  // --- окна --------------------------------------------------------------------

  const openModals = [];
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && openModals.length) {
      e.preventDefault();
      e.stopImmediatePropagation();
      openModals.at(-1).close();
    }
  }, true);

  function modal({ title, body, foot, wide = false, onClose }) {
    const close = () => {
      const i = openModals.indexOf(api);
      if (i < 0) return;
      openModals.splice(i, 1);
      backdrop.remove();
      onClose?.();
    };
    const dialog = h('div', { class: `dialog${wide ? ' wide' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      h('div', { class: 'dialog-head' }, h('h2', null, title),
        h('button', { class: 'icon-btn', title: 'Закрыть (Esc)', onclick: () => close() }, icon('close'))),
      h('div', { class: 'dialog-body' }, body),
      foot ? h('div', { class: 'dialog-foot' }, foot) : null);
    const backdrop = h('div', { class: 'backdrop' }, dialog);
    backdrop.addEventListener('pointerdown', (e) => { if (e.target === backdrop) close(); });
    document.body.append(backdrop);
    const api = { close, el: dialog };
    openModals.push(api);
    return api;
  }

  const isModalOpen = () => openModals.length > 0;

  function confirm(text, { title = 'Подтверждение', ok = 'Да', danger = false } = {}) {
    return new Promise((resolve) => {
      let result = false;
      const okBtn = h('button', { class: `btn ${danger ? 'danger' : 'primary'}`, onclick: () => { result = true; m.close(); } }, ok);
      const m = modal({
        title,
        body: h('p', { class: 'dialog-text' }, text),
        foot: [h('button', { class: 'btn ghost', onclick: () => m.close() }, 'Отмена'), okBtn],
        onClose: () => resolve(result),
      });
      okBtn.focus();
    });
  }

  let toastBox = null;
  function toast(text, { action, onAction, timeout = 4000 } = {}) {
    toastBox ??= document.body.appendChild(h('div', { class: 'toasts', 'aria-live': 'polite' }));
    const el = h('div', { class: 'toast' }, text,
      action ? h('button', { onclick: () => { el.remove(); onAction(); } }, action) : null);
    toastBox.append(el);
    setTimeout(() => el.remove(), timeout);
    return el;
  }

  // --- всплывающая карточка ----------------------------------------------------
  // Наведение на элемент с data-film внутри root показывает сведения о фильме и кнопки.
  // actions(film, hide) — кнопки рядом с «Трейлер», extra(film, hide) — блок под ними.
  // auto() — false: только по клику, без наведения.

  const REST = 550;  // мс неподвижной мыши до показа карточки

  function hovercard(root, { getFilm, actions, extra, suspended = () => false, auto = () => true }) {
    const card = h('div', { class: 'hovercard', hidden: true });
    document.body.append(card);
    let anchor = null;
    let showTimer = 0;
    let hideTimer = 0;

    function fill(film) {
      card.replaceChildren(
        h('div', { class: 'hc-poster' }, poster(film)),
        h('div', { class: 'hc-body' }, info(film)),
        h('div', { class: 'hc-actions' },
          h('button', { class: 'btn primary sm', onclick: () => { hide(); openTrailer(film); } }, icon('play', 14), 'Трейлер'),
          actions ? actions(film, hide) : null),
        extra ? extra(film, hide) : null);
    }

    const GAP = 10;
    function place() {
      const r = anchor.getBoundingClientRect();
      const w = card.offsetWidth;
      const hgt = card.offsetHeight;
      const right = r.right + GAP;
      const leftSide = r.left - GAP - w;
      // Всегда слева от фильма; справа — только если слева не помещается (фильмы у левого края).
      let left = leftSide;
      if (left < 8) left = right;
      if (left + w > innerWidth - 8) left = Math.min(Math.max(8, r.left), innerWidth - w - 8);
      const top = left === right || left === leftSide
        ? Math.min(Math.max(8, r.top - 6), innerHeight - hgt - 8)
        : (r.bottom + GAP + hgt < innerHeight ? r.bottom + GAP : Math.max(8, r.top - GAP - hgt));
      card.style.left = `${Math.round(left)}px`;
      card.style.top = `${Math.round(top)}px`;
    }

    function show(el) {
      const film = getFilm(el.dataset.film);
      if (!film || suspended() || isModalOpen()) return;
      anchor = el;
      lastDist.clear();
      fill(film);
      card.hidden = false;
      place();
    }

    // Закрыть карточку; показ другого фильма, если он уже ждёт своей очереди, остаётся в силе.
    function close() {
      cancelHide();
      card.hidden = true;
      anchor = null;
    }

    function hide() {
      clearTimeout(showTimer);
      close();
    }

    function cancelHide() {
      clearTimeout(hideTimer);
      hideTimer = 0;
    }

    // Уже запланированное скрытие не откладывается: курсор, уходящий в сторону, карточку не держит.
    function scheduleHide() {
      if (!hideTimer) hideTimer = setTimeout(close, 250);
    }

    // Карточка не должна мешать: она появляется, только когда мышь замерла на фильме
    // (каждое движение перезапускает отсчёт), и не появляется при нажатой кнопке.
    // После нажатия на фильм (начало перетаскивания) — молчит, пока курсор не уйдёт с него.
    //
    // Пока карточка открыта, важно намерение курсора: если он приближается к карточке, она не
    // прячется и не переключается на фильмы, которые курсор задевает по пути (через отступ или
    // край соседнего постера). Курсор, который удаляется от карточки, ведёт себя как обычно.
    let pressed = null;
    const lastDist = new Map();  // по pointerId: в окно могут приходить два указателя сразу (mouse и pen)
    const distToCard = (x, y) => {
      const c = card.getBoundingClientRect();
      return Math.hypot(Math.max(c.left - x, 0, x - c.right), Math.max(c.top - y, 0, y - c.bottom));
    };
    root.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch' || e.buttons) return;  // мышь, тачпад, перо (некоторые окна шлют мышь как pen)
      let el = e.target.closest('[data-film]');
      if (el && !root.contains(el)) el = null;
      let approaching = false;
      if (!card.hidden) {
        const dist = distToCard(e.clientX, e.clientY);
        approaching = dist < (lastDist.get(e.pointerId) ?? Infinity);
        lastDist.set(e.pointerId, dist);
        if (el === anchor || approaching) cancelHide();
        else if (!el) scheduleHide();
      }
      clearTimeout(showTimer);
      if (!el || el === anchor || el === pressed || !auto()) return;
      // По пути к карточке другой фильм откроется, только если курсор задержится на нём заметно дольше.
      showTimer = setTimeout(() => show(el), !card.hidden && approaching ? REST * 2 : REST);
    });
    root.addEventListener('pointerout', (e) => {
      const el = e.target.closest('[data-film]');
      if (!el || (e.relatedTarget && (el.contains(e.relatedTarget) || card.contains(e.relatedTarget)))) return;
      clearTimeout(showTimer);
      if (el === pressed) pressed = null;
      if (anchor) scheduleHide();
    });
    root.addEventListener('pointerdown', (e) => {
      const el = e.target.closest('[data-film]');
      if (!el || e.target.closest('button')) return;
      pressed = el;
      hide();
    });
    card.addEventListener('pointerenter', () => {
      cancelHide();
      clearTimeout(showTimer);  // курсор дошёл до карточки: фильмы, задетые по пути, не открываем
    });
    card.addEventListener('pointerleave', (e) => {
      if (!anchor || !anchor.contains(e.relatedTarget)) scheduleHide();
    });
    // Касание (или клик) открывает карточку сразу: на телефоне наведения нет.
    root.addEventListener('click', (e) => {
      const el = e.target.closest('[data-film]');
      if (!el || e.target.closest('button')) return;
      clearTimeout(showTimer);
      if (anchor === el && !card.hidden) return;
      show(el);
    });
    document.addEventListener('pointerdown', (e) => {
      if (!card.hidden && !card.contains(e.target) && !(anchor && anchor.contains(e.target))) hide();
    });
    addEventListener('scroll', () => { if (!card.hidden) hide(); }, { capture: true, passive: true });
    addEventListener('resize', () => { if (!card.hidden) hide(); });

    return {
      hide,
      current: () => (card.hidden ? null : anchor?.dataset.film),
      refresh() {
        if (card.hidden || !anchor) return;
        if (!anchor.isConnected) return hide();
        fill(getFilm(anchor.dataset.film));
        place();
      },
    };
  }

  // --- разное ------------------------------------------------------------------

  function shuffle(list) {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  const plural = (n, one, few, many) => {
    const m10 = n % 10;
    const m100 = n % 100;
    const word = m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many;
    return `${n} ${word}`;
  };

  function fatal(container, message) {
    container.replaceChildren(h('div', { class: 'fatal' }, h('h2', null, 'Не удалось загрузить фильмы'), h('p', null, message)));
  }

  function download(name, data) {
    const url = URL.createObjectURL(data instanceof Blob ? data : new Blob([data], { type: 'application/json' }));
    const a = h('a', { href: url, download: name });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function pickFile(accept) {
    return new Promise((resolve) => {
      const input = h('input', { type: 'file', accept });
      input.addEventListener('change', () => resolve(input.files[0] || null));
      input.click();
    });
  }

  return {
    load, store, KEYS, h, icon, poster, thumbUrl, hue, info, rates, fmt, rateClass, duration,
    openTrailer, modal, isModalOpen, confirm, toast, hovercard, shuffle, plural, fatal, download, pickFile,
  };
})();
