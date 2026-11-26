/* Тир-лист: фильмы раскладываются по слотам перетаскиванием (или клавишами 1–9 над фильмом).
   Каждое изменение сразу пишется в localStorage (CG.KEYS.tier). */
'use strict';

(async () => {
  const { h, icon } = CG;
  const app = document.getElementById('app');
  let data;
  try {
    data = await CG.load();
  } catch (err) {
    return CG.fatal(app, err.message);
  }
  const { films, byId, title } = data;
  document.querySelectorAll('[data-site-title]').forEach((el) => { el.textContent = title; });

  const COLORS = ['#3ccf7a', '#3d8bfd', '#f5b83d', '#f0524f', '#a46cff', '#ff7ac6', '#2ec8d6', '#9aa3b2'];
  const DEFAULT_TIERS = [['Рекомендую', '#3ccf7a'], ['Интересное', '#3d8bfd'], ['Среднее', '#f5b83d'], ['Плохое', '#f0524f']];
  const SIZES = ['s', 'm', 'l'];
  const SORTS = { title: 'По названию', kp: 'По рейтингу КП', year: 'Сначала новые', random: 'Вперемешку' };
  const POOL = 'pool';

  const uid = () => Math.random().toString(36).slice(2, 10);
  const freshTiers = () => DEFAULT_TIERS.map(([name, color]) => ({ id: uid(), name, color, items: [] }));

  // Сохранение могло остаться от прошлой сборки данных: фильмы, которых больше нет, отбрасываются.
  function normalize(raw) {
    const s = raw && typeof raw === 'object' && Array.isArray(raw.tiers) ? raw : {};
    const seen = new Set();
    const clean = (ids) => (Array.isArray(ids) ? ids : []).filter((id) => byId.has(id) && !seen.has(id) && seen.add(id));
    const removed = clean(s.removed);
    const tiers = (s.tiers || []).filter((t) => t && typeof t === 'object').map((t) => ({
      id: String(t.id || uid()),
      name: String(t.name || 'Слот').slice(0, 40),
      color: /^#[0-9a-f]{6}$/i.test(t.color) ? t.color : COLORS[0],
      items: clean(t.items),
    }));
    return {
      v: 1,
      tiers: tiers.length ? tiers : freshTiers(),
      removed,
      size: SIZES.includes(s.size) ? s.size : 'm',
      sort: s.sort in SORTS ? s.sort : 'title',
      hoverInfo: s.hoverInfo !== false,
    };
  }

  let state = normalize(CG.store.get(CG.KEYS.tier));
  const history = [];
  const save = () => CG.store.set(CG.KEYS.tier, state);

  // Любое изменение раскладки идёт через commit: снимок для отмены, сохранение, перерисовка.
  function commit(mutate) {
    const before = JSON.stringify(state);
    mutate();
    if (JSON.stringify(state) === before) return false;
    history.push(before);
    if (history.length > 200) history.shift();
    save();
    render();
    return true;
  }

  function undo() {
    if (!history.length) return;
    state = normalize(JSON.parse(history.pop()));
    save();
    render();
    hover.hide();
  }

  const tierOf = (id) => state.tiers.find((t) => t.items.includes(id)) || null;

  function moveFilm(id, zone, index = Infinity) {
    return commit(() => {
      state.removed = state.removed.filter((x) => x !== id);
      for (const t of state.tiers) t.items = t.items.filter((x) => x !== id);
      const tier = state.tiers.find((t) => t.id === zone);
      if (tier) tier.items.splice(Math.min(index, tier.items.length), 0, id);
    });
  }

  function removeFilm(id) {
    commit(() => {
      for (const t of state.tiers) t.items = t.items.filter((x) => x !== id);
      state.removed = [id, ...state.removed.filter((x) => x !== id)];
    });
    hover.hide();
    CG.toast(`«${byId.get(id).title}» скрыт из игры`, { action: 'Вернуть', onAction: () => restoreFilm(id) });
  }

  function restoreFilm(id) {
    commit(() => { state.removed = state.removed.filter((x) => x !== id); });
  }

  // --- разметка ----------------------------------------------------------------

  const tiersEl = h('div', { class: 'tiers' });
  const poolItems = h('div', { class: 'pool-items', 'data-zone': POOL });
  const poolCount = h('span', { class: 'pool-count' });
  const stats = h('div', { class: 'tl-sub' });
  const undoBtn = h('button', { class: 'btn ghost', title: 'Отменить (Ctrl+Z)', onclick: undo }, icon('undo', 16), 'Отменить');
  const removedBtn = h('button', { class: 'btn ghost', title: 'Фильмы, скрытые из игры', onclick: showRemoved });
  const sizeSeg = h('div', { class: 'seg', title: 'Размер постеров' }, SIZES.map((s) => h('button', {
    'data-size': s,
    onclick: () => { state.size = s; save(); renderPrefs(); },
  }, s.toUpperCase())));
  const searchInput = h('input', { class: 'input', type: 'search', placeholder: 'Поиск по названию', autocomplete: 'off' });
  const sortSelect = h('select', { class: 'input', title: 'Порядок' },
    Object.entries(SORTS).map(([k, v]) => h('option', { value: k }, v)));
  const infoBtn = h('button', {
    class: 'btn ghost info-toggle',
    onclick: () => {
      state.hoverInfo = !state.hoverInfo;
      save();
      renderPrefs();
      hover.hide();
      CG.toast(state.hoverInfo ? 'Карточка фильма появляется при наведении' : 'Карточка фильма — только по клику на постер');
    },
  }, icon('info', 16), 'Подсказки');
  const moreBtn = h('button', { class: 'btn ghost', title: 'Ещё', onclick: (e) => showMenu(e.currentTarget) }, icon('more', 18));

  let query = '';
  let randomRank = new Map();
  const reshuffle = () => { randomRank = new Map(CG.shuffle(films).map((f, i) => [f.id, i])); };
  reshuffle();
  searchInput.addEventListener('input', () => { query = searchInput.value.trim().toLowerCase(); renderPool(); });
  sortSelect.addEventListener('change', () => {
    state.sort = sortSelect.value;
    if (state.sort === 'random') reshuffle();
    save();
    renderPool();
  });

  app.replaceChildren(h('div', { class: 'tl' },
    h('div', { class: 'tl-head' },
      h('div', null, h('h1', null, 'Тир-лист фильмов'), stats),
      h('div', { class: 'tl-tools' }, undoBtn, removedBtn, infoBtn, sizeSeg, moreBtn)),
    h('div', { class: 'tl-layout' },
      h('section', { class: 'tiers-col' },
        tiersEl,
        h('button', { class: 'add-tier', onclick: addTier }, icon('plus', 16), 'Добавить слот'),
        h('p', { class: 'kbd-hint', html: 'Наведите на фильм: <kbd>1</kbd>–<kbd>9</kbd> — в слот, <kbd>0</kbd> — в нераспределённые, '
          + '<kbd>Del</kbd> — скрыть из игры · <kbd>Ctrl</kbd>+<kbd>Z</kbd> — отменить' })),
      h('aside', { class: 'pool' },
        h('div', { class: 'pool-head' },
          h('div', { class: 'pool-title' }, h('h2', null, 'Не распределено'), poolCount),
          h('div', { class: 'pool-filters' }, h('label', { class: 'search' }, icon('search', 16), searchInput), sortSelect)),
        poolItems))));

  const cards = new Map();
  function cardEl(id) {
    let el = cards.get(id);
    if (el) return el;
    const f = byId.get(id);
    el = h('div', { class: 'card', 'data-film': id, draggable: 'true' },
      CG.poster(f),
      h('div', { class: 'card-title' }, f.title),
      f.kp ? h('span', { class: `card-kp ${CG.rateClass(f.kp)}` }, CG.fmt(f.kp)) : null);
    cards.set(id, el);
    return el;
  }

  function tierRow(t, i) {
    const last = state.tiers.length - 1;
    return h('div', { class: 'tier', 'data-tier': t.id, style: { '--c': t.color } },
      h('div', { class: 'tier-label' },
        h('div', { class: 'tier-name-row' },
          h('button', { class: 'tier-dot', title: 'Цвет слота', onclick: (e) => pickColor(t.id, e.currentTarget) }),
          h('button', { class: 'tier-name', title: 'Переименовать', onclick: (e) => rename(t.id, e.currentTarget) }, t.name)),
        h('div', { class: 'tier-count' },
          CG.plural(t.items.length, 'фильм', 'фильма', 'фильмов'),
          i < 9 ? h('kbd', { title: `Клавиша ${i + 1}: переместить сюда фильм под курсором` }, i + 1) : null),
        h('div', { class: 'tier-tools' },
          h('button', { class: 'icon-btn', title: 'Выше', disabled: i === 0, onclick: () => moveTier(t.id, -1) }, icon('up', 16)),
          h('button', { class: 'icon-btn', title: 'Ниже', disabled: i === last, onclick: () => moveTier(t.id, 1) }, icon('down', 16)),
          h('button', { class: 'icon-btn', title: 'Переименовать', onclick: (e) => rename(t.id, e.currentTarget.closest('.tier').querySelector('.tier-name')) }, icon('edit', 15)),
          h('button', { class: 'icon-btn danger', title: 'Удалить слот', disabled: !last, onclick: () => removeTier(t.id) }, icon('trash', 15)))),
      h('div', { class: 'tier-items', 'data-zone': t.id }, t.items.map(cardEl)));
  }

  function poolFilms() {
    const used = new Set(state.removed);
    for (const t of state.tiers) for (const id of t.items) used.add(id);
    const list = films.filter((f) => !used.has(f.id));
    const byTitle = (a, b) => a.title.localeCompare(b.title, 'ru');
    const sorters = {
      title: byTitle,
      kp: (a, b) => (b.kp || 0) - (a.kp || 0) || byTitle(a, b),
      year: (a, b) => (parseInt(b.year, 10) || 0) - (parseInt(a.year, 10) || 0) || byTitle(a, b),
      random: (a, b) => randomRank.get(a.id) - randomRank.get(b.id),
    };
    return list.sort(sorters[state.sort]);
  }

  function renderPool() {
    const list = poolFilms();
    const shown = query ? list.filter((f) => `${f.title} ${f.original || ''}`.toLowerCase().includes(query)) : list;
    poolItems.replaceChildren(...shown.map((f) => cardEl(f.id)));
    poolCount.textContent = list.length;
    // Подпись пустого списка рисует CSS внутри самой зоны: она остаётся местом, куда бросать.
    poolItems.dataset.empty = list.length ? 'Ничего не найдено' : 'Все фильмы распределены';
  }

  function renderPrefs() {
    app.firstChild.dataset.size = state.size;
    sizeSeg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.size === state.size));
    sortSelect.value = state.sort;
    infoBtn.classList.toggle('on', state.hoverInfo);
    infoBtn.title = state.hoverInfo
      ? 'Карточка фильма при наведении: включена. Нажмите, чтобы открывать её только по клику'
      : 'Карточка фильма только по клику. Нажмите, чтобы показывать её при наведении';
  }

  function render() {
    tiersEl.replaceChildren(...state.tiers.map(tierRow));
    renderPool();
    renderPrefs();
    const placed = state.tiers.reduce((n, t) => n + t.items.length, 0);
    const inGame = films.length - state.removed.length;
    stats.textContent = `Распределено ${placed} из ${inGame}`;
    removedBtn.replaceChildren(icon('eyeOff', 16), `Скрытые · ${state.removed.length}`);
    undoBtn.disabled = !history.length;
  }

  // --- слоты -------------------------------------------------------------------

  const tierById = (id) => state.tiers.find((t) => t.id === id);

  function rename(tierId, btn) {
    const tier = tierById(tierId);
    if (!tier || !btn) return;
    const input = h('input', { class: 'input tier-input', value: tier.name, maxlength: 40 });
    btn.replaceWith(input);
    input.focus();
    input.select();
    let done = false;
    const finish = (keep) => {
      if (done) return;
      done = true;
      const name = input.value.trim();
      if (!keep || !name || !commit(() => { tierById(tierId).name = name; })) render();
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') finish(true);
      if (e.key === 'Escape') finish(false);
    });
    input.addEventListener('blur', () => finish(true));
  }

  function moveTier(tierId, delta) {
    commit(() => {
      const i = state.tiers.findIndex((t) => t.id === tierId);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= state.tiers.length) return;
      [state.tiers[i], state.tiers[j]] = [state.tiers[j], state.tiers[i]];
    });
  }

  async function removeTier(tierId) {
    const tier = tierById(tierId);
    if (!tier || state.tiers.length < 2) return;
    if (tier.items.length) {
      const ok = await CG.confirm(
        `Удалить слот «${tier.name}»? ${CG.plural(tier.items.length, 'фильм вернётся', 'фильма вернутся', 'фильмов вернутся')} в нераспределённые.`,
        { title: 'Удалить слот', ok: 'Удалить', danger: true });
      if (!ok) return;
    }
    commit(() => { state.tiers = state.tiers.filter((t) => t.id !== tierId); });
    CG.toast(`Слот «${tier.name}» удалён`, { action: 'Отменить', onAction: undo });
  }

  function addTier() {
    const used = new Set(state.tiers.map((t) => t.color));
    const color = COLORS.find((c) => !used.has(c)) || COLORS[state.tiers.length % COLORS.length];
    const tier = { id: uid(), name: 'Новый слот', color, items: [] };
    commit(() => state.tiers.push(tier));
    const row = tiersEl.querySelector(`[data-tier="${tier.id}"]`);
    row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    rename(tier.id, row.querySelector('.tier-name'));
  }

  // --- всплывающие меню ----------------------------------------------------------

  let dropdown = null;
  function closeDropdown() {
    dropdown?.remove();
    dropdown = null;
  }
  function openDropdown(anchor, content, cls = '') {
    closeDropdown();
    dropdown = h('div', { class: `dropdown ${cls}` }, content);
    document.body.append(dropdown);
    const r = anchor.getBoundingClientRect();
    const w = dropdown.offsetWidth;
    dropdown.style.top = `${Math.min(r.bottom + 6, innerHeight - dropdown.offsetHeight - 8)}px`;
    dropdown.style.left = `${Math.max(8, Math.min(r.left, innerWidth - w - 8))}px`;
  }
  document.addEventListener('pointerdown', (e) => {
    if (dropdown && !dropdown.contains(e.target)) closeDropdown();
  }, true);
  addEventListener('scroll', closeDropdown, { passive: true });

  function pickColor(tierId, anchor) {
    const tier = tierById(tierId);
    openDropdown(anchor, COLORS.map((c) => h('button', {
      class: `swatch${c === tier.color ? ' on' : ''}`, style: { '--c': c }, title: c,
      onclick: () => { closeDropdown(); commit(() => { tierById(tierId).color = c; }); },
    })), 'swatches');
  }

  function showMenu(anchor) {
    const item = (ic, text, fn, cls = '') => h('button', { class: cls, onclick: () => { closeDropdown(); fn(); } }, icon(ic, 16), text);
    openDropdown(anchor, [
      item('image', 'Сохранить картинкой', saveImage),
      h('hr'),
      item('download', 'Сохранить в файл', exportFile),
      item('upload', 'Загрузить из файла', importFile),
      h('hr'),
      item('restore', 'Начать заново', resetAll, 'danger'),
    ]);
  }

  let rendering = false;
  async function saveImage() {
    if (rendering) return;
    if (!state.tiers.some((t) => t.items.length)) {
      CG.toast('На картинку попадают фильмы из слотов — сначала разложите хотя бы один');
      return;
    }
    rendering = true;
    const wait = CG.toast('Собираю картинку…', { timeout: 60000 });
    try {
      const { blob, fallback } = await TierImage.render({ tiers: state.tiers, byId, siteTitle: title });
      const url = URL.createObjectURL(blob);
      const name = `tierlist-${new Date().toISOString().slice(0, 10)}.png`;
      const m = CG.modal({
        title: 'Картинка тир-листа',
        wide: true,
        body: [
          fallback ? h('p', { class: 'dialog-text meta' }, 'Часть постеров их сайт не разрешил рисовать — вместо них плашки с названием.') : null,
          h('div', { class: 'image-preview' }, h('img', { src: url, alt: 'Тир-лист фильмов' })),
        ],
        foot: [
          h('button', { class: 'btn ghost', onclick: () => m.close() }, 'Закрыть'),
          h('button', { class: 'btn primary', onclick: () => CG.download(name, blob) }, icon('download', 16), 'Скачать PNG'),
        ],
        onClose: () => URL.revokeObjectURL(url),
      });
    } catch {
      CG.toast('Не получилось собрать картинку');
    } finally {
      wait.remove();
      rendering = false;
    }
  }

  function exportFile() {
    const day = new Date().toISOString().slice(0, 10);
    CG.download(`tierlist-${day}.json`, JSON.stringify({ app: 'kinogames-tier', v: 1, state }, null, 1));
  }

  async function importFile() {
    const file = await CG.pickFile('application/json,.json');
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      if (parsed?.app !== 'kinogames-tier' || !parsed.state) throw new Error('bad file');
      commit(() => { state = normalize(parsed.state); });
      CG.toast('Тир-лист загружен из файла', { action: 'Отменить', onAction: undo });
    } catch {
      CG.toast('Это не файл тир-листа');
    }
  }

  async function resetAll() {
    const ok = await CG.confirm('Все фильмы вернутся в нераспределённые, слоты станут как по умолчанию, скрытые фильмы вернутся в игру.',
      { title: 'Начать заново?', ok: 'Начать заново', danger: true });
    if (!ok) return;
    commit(() => { state = { ...state, tiers: freshTiers(), removed: [] }; });
    CG.toast('Тир-лист сброшен', { action: 'Отменить', onAction: undo });
  }

  // --- скрытые фильмы ------------------------------------------------------------

  function showRemoved() {
    const list = h('div', { class: 'removed-list' });
    const fill = () => {
      list.replaceChildren(...state.removed.map((id) => {
        const f = byId.get(id);
        return h('div', { class: 'removed-item' },
          h('div', { class: 'removed-poster' }, CG.poster(f)),
          h('div', { class: 'removed-info' }, h('b', null, f.title), h('span', { class: 'meta' }, [f.kind, f.year].filter(Boolean).join(' · '))),
          h('button', { class: 'btn sm', onclick: () => { restoreFilm(id); fill(); } }, icon('restore', 14), 'Вернуть'));
      }));
      if (!state.removed.length) list.append(h('p', { class: 'meta' }, 'Пусто. Сюда попадают фильмы, скрытые из игры: их можно вернуть.'));
      restoreAll.disabled = !state.removed.length;
    };
    const restoreAll = h('button', { class: 'btn', onclick: () => { commit(() => { state.removed = []; }); fill(); } }, 'Вернуть все');
    const m = CG.modal({
      title: 'Скрытые фильмы',
      body: [h('p', { class: 'dialog-text meta' }, 'Эти фильмы не показываются в тир-листе. Возвращённый фильм попадёт в нераспределённые.'), list],
      foot: [restoreAll, h('button', { class: 'btn primary', onclick: () => m.close() }, 'Готово')],
    });
    fill();
  }

  // --- карточка при наведении -------------------------------------------------------

  const drag = { active: false };

  const hover = CG.hovercard(app, {
    getFilm: (id) => byId.get(id),
    suspended: () => drag.active,
    auto: () => state.hoverInfo,
    actions: (film, hide) => h('button', {
      class: 'btn sm', title: 'Скрыть фильм из игры. Вернуть его можно в списке «Скрытые»',
      onclick: () => { hide(); removeFilm(film.id); },
    }, icon('eyeOff', 14), 'Скрыть'),
    extra: (film, hide) => {
      const current = tierOf(film.id);
      return h('div', { class: 'hc-move' }, h('span', null, 'Переместить в слот'),
        state.tiers.map((t, i) => h('button', {
          class: current === t ? 'on' : '', style: { '--c': t.color },
          onclick: () => { hide(); moveFilm(film.id, t.id); },
        }, h('i'), t.name, i < 9 ? h('kbd', null, i + 1) : null)),
        current ? h('button', { onclick: () => { hide(); moveFilm(film.id, POOL); } }, 'В нераспределённые', h('kbd', null, 0)) : null);
    },
  });

  // Фильм под курсором — для клавиш 1–9 / 0 / Del.
  let hovered = null;
  app.addEventListener('pointerover', (e) => { hovered = e.target.closest('[data-film]')?.dataset.film ?? null; });
  app.addEventListener('pointerleave', () => { hovered = null; });

  document.addEventListener('keydown', (e) => {
    if (CG.isModalOpen() || e.target.closest?.('input, textarea, select')) return;
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ' && !e.shiftKey) {
      e.preventDefault();
      if (!drag.active) undo();
      return;
    }
    const id = hover.current() || hovered;
    if (!id || drag.active || e.ctrlKey || e.metaKey || e.altKey) return;
    if (/^Digit[0-9]$/.test(e.code) || /^Numpad[0-9]$/.test(e.code)) {
      const n = Number(e.code.at(-1));
      const target = n === 0 ? POOL : state.tiers[n - 1]?.id;
      if (!target) return;
      e.preventDefault();
      hover.hide();
      hovered = null;
      moveFilm(id, target);
    } else if (e.key === 'Delete') {
      e.preventDefault();
      hovered = null;
      removeFilm(id);
    }
  });

  // --- перетаскивание ------------------------------------------------------------
  // Родной drag-and-drop браузера (карточки draggable): так он работает с любой мышью и тачпадом.
  // Своё здесь — место вставки внутри слота (пунктирная рамка) и автопрокрутка у краёв окна
  // и списка нераспределённых. Esc во время перетаскивания отменяет его (это делает браузер).

  const zoneOf = (el) => el?.closest?.('[data-zone]')
    || el?.closest?.('.tier')?.querySelector('[data-zone]')
    || (el?.closest?.('.pool') ? poolItems : null);

  app.addEventListener('dragstart', (e) => {
    const card = e.target.closest?.('.card');
    if (!card || drag.active || CG.isModalOpen()) return;
    if (document.activeElement?.matches('input')) document.activeElement.blur();
    hover.hide();
    closeDropdown();
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', '');  // без данных Firefox не начинает перетаскивание
    Object.assign(drag, {
      active: true, id: card.dataset.film, src: card, zone: null,
      x: e.clientX, y: e.clientY, ph: h('div', { class: 'card-ph' }),
    });
    document.body.classList.add('dragging');
    // Прячем карточку на следующем кадре: браузер уже снял с неё картинку для курсора,
    // а скрытие прямо в dragstart Chrome считает отменой перетаскивания.
    setTimeout(() => {
      if (!drag.active || drag.src !== card) return;
      card.before(drag.ph);
      card.classList.add('drag-src');
    });
    drag.raf = requestAnimationFrame(autoScroll);
  });

  document.addEventListener('dragover', (e) => {
    if (!drag.active) return;
    drag.x = e.clientX;
    drag.y = e.clientY;
    const zone = zoneOf(e.target);
    if (zone) {
      e.preventDefault();  // разрешает бросить сюда
      e.dataTransfer.dropEffect = 'move';
    }
    place(zone);
  });

  document.addEventListener('drop', (e) => {
    if (!drag.active) return;
    e.preventDefault();
    endDrag(Boolean(zoneOf(e.target)));
  });

  // Бросили мимо слотов или нажали Esc: drop не было, только dragend.
  document.addEventListener('dragend', () => { if (drag.active) endDrag(false); });

  function place(zone) {
    if (zone !== drag.zone) {
      drag.zone?.classList.remove('drop-over');
      zone?.classList.add('drop-over');
      drag.zone = zone;
    }
    // Нераспределённые отсортированы — место вставки там не важно.
    if (!zone || zone.dataset.zone === POOL) {
      drag.ph.remove();
      return;
    }
    let before = null;
    for (const c of zone.children) {
      if (!c.classList.contains('card') || c === drag.src) continue;
      const r = c.getBoundingClientRect();
      if (drag.y < r.top || (drag.y <= r.bottom && drag.x < r.left + r.width / 2)) {
        before = c;
        break;
      }
    }
    if (before) {
      if (drag.ph.nextSibling !== before) zone.insertBefore(drag.ph, before);
    } else if (zone.lastElementChild !== drag.ph) {
      zone.append(drag.ph);
    }
  }

  function autoScroll() {
    if (!drag.active) return;
    const top = 64 + 60;
    const bottom = innerHeight - 60;
    let dy = 0;
    if (drag.y < top) dy = -Math.ceil((top - drag.y) / 5);
    else if (drag.y > bottom) dy = Math.ceil((drag.y - bottom) / 5);
    if (dy) scrollBy(0, dy);
    const pr = poolItems.getBoundingClientRect();
    if (drag.x >= pr.left && drag.x <= pr.right) {
      if (drag.y < pr.top + 50 && drag.y > pr.top - 30) poolItems.scrollTop -= 10;
      else if (drag.y > pr.bottom - 50 && drag.y < pr.bottom + 30) poolItems.scrollTop += 10;
    }
    drag.raf = requestAnimationFrame(autoScroll);
  }

  function endDrag(drop) {
    cancelAnimationFrame(drag.raf);
    const { id, zone, ph, src } = drag;
    let index = Infinity;
    if (drop && zone && ph.parentNode === zone) {
      index = 0;
      for (const c of zone.children) {
        if (c === ph) break;
        if (c.classList.contains('card') && c !== src) index++;
      }
    }
    ph.remove();
    src.classList.remove('drag-src');
    zone?.classList.remove('drop-over');
    document.body.classList.remove('dragging');
    drag.active = false;
    if (drop && zone) moveFilm(id, zone.dataset.zone, index);
  }

  // Тир-лист открыт и в другой вкладке: берём её изменения, иначе следующее сохранение здесь их затрёт.
  addEventListener('storage', (e) => {
    if (e.key !== CG.KEYS.tier) return;
    if (drag.active) endDrag(false);
    state = normalize(CG.store.get(CG.KEYS.tier));
    history.length = 0;
    hover.hide();
    closeDropdown();
    render();
  });

  render();
})();
