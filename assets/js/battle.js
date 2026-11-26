/* Битва фильмов: турнир на выбывание. В каждой паре игрок выбирает лучший фильм, победители
   идут в следующий раунд; при нечётном числе последний фильм раунда проходит без пары.
   Каждый выбор сразу пишется в localStorage (CG.KEYS.battle). */
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

  const SIZES = [8, 16, 32, 64, 128, 256];
  const KINDS = [...new Set(films.map((f) => f.kind))];

  // state.status: setup | running | done; rounds[i] = { entrants, picks, intro }:
  // пара k — entrants[2k] и entrants[2k + 1], picks[k] — её победитель.
  function load() {
    const s = CG.store.get(CG.KEYS.battle) || {};
    const prefs = {
      kinds: Array.isArray(s.prefs?.kinds) ? s.prefs.kinds.filter((k) => KINDS.includes(k)) : KINDS.slice(),
      size: SIZES.includes(s.prefs?.size) ? s.prefs.size : 'all',
    };
    if (!prefs.kinds.length) prefs.kinds = KINDS.slice();
    const rounds = Array.isArray(s.rounds) ? s.rounds : [];
    const valid = rounds.length && rounds.every((r) => Array.isArray(r?.entrants) && Array.isArray(r.picks)
      && [...r.entrants, ...r.picks].every((id) => byId.has(id)));
    if ((s.status === 'running' || s.status === 'done') && !valid) {
      setTimeout(() => CG.toast('Список фильмов обновился — незаконченный турнир сброшен', { timeout: 6000 }));
    }
    return valid && (s.status === 'running' || s.status === 'done')
      ? { status: s.status, id: s.id || Date.now(), prefs, rounds }
      : { status: 'setup', prefs, rounds: [] };
  }

  let state = load();
  let busy = false;
  const save = () => CG.store.set(CG.KEYS.battle, state);
  const current = () => state.rounds.at(-1);

  function roundName(n) {
    if (n <= 2) return 'Финал';
    if (n <= 4) return 'Полуфинал';
    if (n <= 8) return 'Четвертьфинал';
    return `1/${2 ** (Math.ceil(Math.log2(n)) - 1)} финала`;
  }
  const roundsTotal = (n) => Math.ceil(Math.log2(n));
  const filmsWord = (n) => CG.plural(n, 'фильм', 'фильма', 'фильмов');

  // --- история победителей -------------------------------------------------------

  const getHistory = () => (CG.store.get(CG.KEYS.battleHistory) || []).filter((e) => e && byId.has(e.w));
  function addHistory() {
    const list = getHistory().filter((e) => e.id !== state.id);
    list.unshift({ id: state.id, w: current().picks[0], n: state.rounds[0].entrants.length, at: Date.now() });
    CG.store.set(CG.KEYS.battleHistory, list.slice(0, 30));
  }
  const dropHistory = () => CG.store.set(CG.KEYS.battleHistory, getHistory().filter((e) => e.id !== state.id));

  // --- ход игры ------------------------------------------------------------------

  function start() {
    const pool = films.filter((f) => state.prefs.kinds.includes(f.kind)).map((f) => f.id);
    const size = state.prefs.size === 'all' ? pool.length : Math.min(state.prefs.size, pool.length);
    if (size < 2) return;
    state = { status: 'running', id: Date.now(), prefs: state.prefs, rounds: [{ entrants: CG.shuffle(pool).slice(0, size), picks: [], intro: false }] };
    save();
    render();
  }

  function pick(side) {
    if (busy || state.status !== 'running' || current().intro) return;
    const r = current();
    const i = r.picks.length;
    const winner = r.entrants[2 * i + side];
    r.picks.push(winner);
    if (r.picks.length === Math.floor(r.entrants.length / 2)) {
      // Фильм без пары встаёт в начало следующего раунда — так он не останется без пары дважды подряд.
      const next = r.entrants.length % 2 ? [r.entrants.at(-1), ...r.picks] : r.picks.slice();
      if (next.length === 1) {
        state.status = 'done';
        addHistory();
      } else {
        state.rounds.push({ entrants: next, picks: [], intro: true });
      }
    }
    save();
    busy = true;
    const fighters = app.querySelectorAll('.fighter');
    fighters[side]?.classList.add('won');
    fighters[1 - side]?.classList.add('lost');
    setTimeout(() => { busy = false; render(); }, 450);
  }

  function undo() {
    if (busy || state.status === 'setup') return;
    if (state.status === 'done') {
      dropHistory();
      state.status = 'running';
    }
    let r = current();
    if (!r.picks.length && state.rounds.length > 1) {
      state.rounds.pop();
      r = current();
    }
    if (!r.picks.length) return;
    r.picks.pop();
    r.intro = false;
    save();
    render();
  }

  function beginRound() {
    current().intro = false;
    save();
    render();
  }

  async function reset() {
    const ok = await CG.confirm('Текущий турнир будет потерян. Победители прошлых турниров останутся в истории.',
      { title: 'Новый турнир?', ok: 'Начать заново', danger: state.status === 'running' });
    if (!ok) return;
    state = { status: 'setup', prefs: state.prefs, rounds: [] };
    save();
    render();
  }

  // --- экраны --------------------------------------------------------------------

  function render() {
    if (state.status === 'setup') renderSetup();
    else if (state.status === 'done') renderDone();
    else if (current().intro) renderIntro();
    else renderDuel();
  }

  function renderSetup() {
    const counts = new Map(KINDS.map((k) => [k, films.filter((f) => f.kind === k).length]));
    const available = () => films.filter((f) => state.prefs.kinds.includes(f.kind)).length;
    const kindsBox = h('div', { class: 'bt-chips' });
    const sizeBox = h('div', { class: 'bt-chips' });
    const summary = h('div', { class: 'bt-summary' });
    const startBtn = h('button', { class: 'btn primary lg', onclick: start }, icon('play', 16), 'Начать турнир');

    const update = () => {
      const avail = available();
      if (state.prefs.size !== 'all' && state.prefs.size >= avail) state.prefs.size = 'all';
      kindsBox.replaceChildren(...KINDS.map((k) => h('button', {
        class: `chip${state.prefs.kinds.includes(k) ? ' on' : ''}`,
        onclick: () => {
          const on = state.prefs.kinds.includes(k);
          if (on && state.prefs.kinds.length === 1) return;
          state.prefs.kinds = on ? state.prefs.kinds.filter((x) => x !== k) : [...state.prefs.kinds, k];
          save();
          update();
        },
      }, k, h('small', null, counts.get(k)))));
      sizeBox.replaceChildren(...[...SIZES.filter((n) => n < avail), 'all'].map((n) => h('button', {
        class: `chip${state.prefs.size === n ? ' on' : ''}`,
        onclick: () => { state.prefs.size = n; save(); update(); },
      }, n === 'all' ? `Все · ${avail}` : `${n} случайных`)));
      const size = state.prefs.size === 'all' ? avail : state.prefs.size;
      summary.replaceChildren(size < 2 ? 'Для турнира нужно хотя бы два фильма'
        : h('span', null, h('b', null, filmsWord(size)), ` → ${CG.plural(roundsTotal(size), 'раунд', 'раунда', 'раундов')}, `
          + `${CG.plural(size - 1, 'сравнение', 'сравнения', 'сравнений')}`));
      startBtn.disabled = size < 2;
    };
    update();

    const history = getHistory();
    app.replaceChildren(h('section', { class: 'bt-setup' },
      h('div', { class: 'bt-hero' },
        h('span', { class: 'bt-hero-icon' }, icon('trophy', 26)),
        h('h1', null, 'Битва фильмов'),
        h('p', null, 'Вам показывают два фильма — выберите лучший. Победители проходят дальше: из 100 фильмов остаётся 50, '
          + 'потом 25, 13… пока не останется один — лучший фильм.')),
      h('div', { class: 'bt-panel' },
        h('div', { class: 'bt-field' }, h('label', null, 'Что участвует'), kindsBox),
        h('div', { class: 'bt-field' }, h('label', null, 'Сколько фильмов'), sizeBox),
        h('div', { class: 'bt-start' }, summary, startBtn)),
      history.length ? h('div', { class: 'bt-history' },
        h('h2', null, 'Прошлые победители'),
        h('div', { class: 'bt-history-list' }, history.map((e) => {
          const f = byId.get(e.w);
          return h('div', { class: 'bt-history-item', title: f.title },
            h('div', { class: 'bt-history-poster' }, CG.poster(f)),
            h('b', null, f.title),
            h('span', null, `из ${e.n} · ${new Date(e.at).toLocaleDateString('ru-RU')}`));
        }))) : null));
  }

  function progressBar() {
    const r = current();
    const total = state.rounds[0].entrants.length - 1;
    const done = state.rounds.reduce((n, x) => n + x.picks.length, 0);
    const pairs = Math.floor(r.entrants.length / 2);
    return h('div', { class: 'bt-progress' },
      h('div', { class: 'bt-round' },
        h('b', null, roundName(r.entrants.length)),
        h('span', null, `Раунд ${state.rounds.length} из ${roundsTotal(state.rounds[0].entrants.length)} · в борьбе ${filmsWord(r.entrants.length)}`)),
      h('div', { class: 'bt-bar' },
        h('div', { class: 'bt-bar-track' }, h('i', { style: { width: `${(done / total) * 100}%` } })),
        h('span', null, r.intro ? `${CG.plural(pairs, 'пара', 'пары', 'пар')} в раунде` : `Пара ${Math.min(r.picks.length + 1, pairs)} из ${pairs}`)),
      h('div', { class: 'bt-tools' },
        h('button', { class: 'btn ghost sm', title: 'Отменить последний выбор (Backspace)', disabled: !done, onclick: undo }, icon('undo', 15), 'Отменить'),
        h('button', { class: 'btn ghost sm', title: 'Начать новый турнир', onclick: reset }, icon('restore', 15), 'Заново')));
  }

  function fighter(film, side) {
    const key = side ? '→' : '←';
    return h('article', { class: `fighter side-${side}` },
      h('button', { class: 'fighter-poster', title: 'Выбрать этот фильм', onclick: () => pick(side) },
        CG.poster(film, { full: true }), h('span', { class: 'fighter-pick' }, 'Выбрать')),
      h('div', { class: 'fighter-info' },
        CG.info(film, { titleTag: 'h2' }),
        h('div', { class: 'fighter-actions' },
          h('button', { class: 'btn', onclick: () => CG.openTrailer(film) }, icon('play', 15), 'Трейлер'),
          h('button', { class: 'btn primary', onclick: () => pick(side) }, `Этот лучше ${key}`))));
  }

  function renderDuel() {
    const r = current();
    const i = r.picks.length;
    const pair = [byId.get(r.entrants[2 * i]), byId.get(r.entrants[2 * i + 1])];
    app.replaceChildren(h('section', { class: 'bt-run' },
      progressBar(),
      h('div', { class: 'duel' }, fighter(pair[0], 0), h('div', { class: 'vs' }, h('span', null, 'VS')), fighter(pair[1], 1)),
      h('p', { class: 'kbd-hint bt-keys', html: '<kbd>←</kbd> / <kbd>→</kbd> — выбрать · <kbd>Backspace</kbd> — отменить выбор' }),
      r.picks.length ? h('div', { class: 'bt-strip' },
        h('span', null, `Прошли дальше · ${r.picks.length}`),
        h('div', { class: 'bt-strip-list' }, r.picks.slice().reverse().map((id) => h('div', { class: 'bt-strip-item', title: byId.get(id).title }, CG.poster(byId.get(id)))))) : null));
  }

  function renderIntro() {
    const prev = state.rounds.at(-2);
    const r = current();
    const bye = prev.entrants.length % 2 ? byId.get(prev.entrants.at(-1)) : null;
    const pairs = Math.floor(r.entrants.length / 2);
    app.replaceChildren(h('section', { class: 'bt-run' },
      progressBar(),
      h('div', { class: 'bt-intro' },
        h('span', { class: 'bt-intro-step' }, `Раунд ${state.rounds.length}`),
        h('h1', null, roundName(r.entrants.length)),
        h('p', null, `В борьбе ${filmsWord(r.entrants.length)}: ${CG.plural(pairs, 'пара', 'пары', 'пар')}`
          + (r.entrants.length % 2 ? ', один фильм пройдёт без пары' : '')),
        bye ? h('div', { class: 'bt-bye' }, h('div', { class: 'bt-bye-poster' }, CG.poster(bye)),
          h('span', null, `«${bye.title}» прошёл прошлый раунд без пары`)) : null,
        h('div', { class: 'bt-intro-posters' }, r.entrants.slice(0, 14).map((id) => h('div', { class: 'bt-intro-poster' }, CG.poster(byId.get(id))))),
        h('button', { class: 'btn primary lg', onclick: beginRound }, 'Начать раунд', h('span', { class: 'kbd-hint' }, h('kbd', null, 'Enter'))))));
  }

  function renderDone() {
    const last = current();
    const winner = byId.get(last.picks[0]);
    const losers = (r) => r.entrants.filter((id, k) => k < Math.floor(r.entrants.length / 2) * 2 && !r.picks.includes(id));
    const finalist = losers(last)[0];
    const semi = state.rounds.length > 1 ? losers(state.rounds.at(-2)) : [];
    const path = state.rounds.map((r) => {
      const k = r.entrants.indexOf(winner.id);
      const solo = k === r.entrants.length - 1 && r.entrants.length % 2;
      const rival = solo ? null : byId.get(r.entrants[k ^ 1]);
      return h('li', null, h('b', null, roundName(r.entrants.length)),
        rival ? h('span', null, 'обошёл «', rival.title, '»') : h('span', { class: 'meta' }, 'прошёл без пары'));
    });
    const small = (id, label) => {
      const f = byId.get(id);
      return h('div', { class: 'podium-item' },
        h('button', { class: 'podium-poster', title: 'Трейлер', onclick: () => CG.openTrailer(f) }, CG.poster(f)),
        h('span', { class: 'podium-label' }, label), h('b', null, f.title));
    };

    app.replaceChildren(h('section', { class: 'bt-done' },
      h('div', { class: 'winner' },
        h('div', { class: 'winner-poster' }, CG.poster(winner, { full: true })),
        h('div', { class: 'winner-info' },
          h('span', { class: 'winner-label' }, icon('trophy', 18), `Лучший фильм из ${state.rounds[0].entrants.length}`),
          CG.info(winner, { titleTag: 'h1' }),
          h('div', { class: 'fighter-actions' },
            h('button', { class: 'btn primary', onclick: () => CG.openTrailer(winner) }, icon('play', 15), 'Трейлер'),
            h('button', { class: 'btn', onclick: reset }, icon('restore', 15), 'Новый турнир'),
            h('button', { class: 'btn ghost', onclick: undo, title: 'Вернуться к финалу' }, icon('undo', 15), 'Отменить выбор')))),
      h('div', { class: 'bt-results' },
        h('div', { class: 'podium' }, h('h2', null, 'Пьедестал'),
          h('div', { class: 'podium-list' }, finalist ? small(finalist, 'Финалист') : null, semi.map((id) => small(id, 'Полуфиналист')))),
        h('div', { class: 'path' }, h('h2', null, 'Путь к победе'), h('ol', null, path)))));
  }

  document.addEventListener('keydown', (e) => {
    if (CG.isModalOpen() || e.target.closest?.('input, textarea, select') || e.altKey) return;
    if (state.status === 'setup') return;
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') {
      e.preventDefault();
      return undo();
    }
    if (e.ctrlKey || e.metaKey) return;
    if (e.key === 'Backspace') {
      e.preventDefault();
      return undo();
    }
    if (state.status !== 'running') return;
    if (current().intro) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        beginRound();
      }
      return;
    }
    if (e.key === 'ArrowLeft' || e.code === 'KeyA') {
      e.preventDefault();
      pick(0);
    } else if (e.key === 'ArrowRight' || e.code === 'KeyD') {
      e.preventDefault();
      pick(1);
    }
  });

  // Турнир открыт и в другой вкладке: показываем её ход, иначе следующий выбор здесь его затрёт.
  addEventListener('storage', (e) => {
    if (e.key !== CG.KEYS.battle) return;
    state = load();
    busy = false;
    render();
  });

  render();
})();
