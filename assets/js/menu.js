/* Меню: две игры и прогресс каждой (только чтение их сохранений). */
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
  document.title = title;

  const sample = CG.shuffle(films.filter((f) => f.poster)).concat(CG.shuffle(films.filter((f) => !f.poster)));
  const take = (() => { let i = 0; return () => sample[i++ % sample.length]; })();
  const mini = (film) => h('div', { class: 'mini' }, CG.poster(film));

  // --- тир-лист ---
  const tier = CG.store.get(CG.KEYS.tier);
  const removed = new Set((tier?.removed || []).filter((id) => byId.has(id)));
  const placed = new Set((tier?.tiers || []).flatMap((t) => t.items).filter((id) => byId.has(id) && !removed.has(id)));
  const inGame = films.length - removed.size;
  const tierRows = (tier?.tiers?.length ? tier.tiers : [
    { name: 'Рекомендую', color: '#3ccf7a' }, { name: 'Интересное', color: '#3d8bfd' },
    { name: 'Среднее', color: '#f5b83d' }, { name: 'Плохое', color: '#f0524f' },
  ]).slice(0, 4);
  const tierStatus = !placed.size ? 'Ещё не начат'
    : placed.size >= inGame ? `Готово: все ${CG.plural(inGame, 'фильм', 'фильма', 'фильмов')} распределены`
      : `Распределено ${placed.size} из ${inGame}`;

  // --- битва ---
  const battle = CG.store.get(CG.KEYS.battle);
  let battleStatus = 'Ещё не начата';
  let battleProgress = 0;
  if (battle?.status === 'running' && battle.rounds?.length) {
    const round = battle.rounds.at(-1);
    const total = battle.rounds[0].entrants.length - 1;
    const done = battle.rounds.reduce((n, r) => n + r.picks.length, 0);
    battleStatus = `Идёт: раунд ${battle.rounds.length}, в борьбе ${CG.plural(round.entrants.length, 'фильм', 'фильма', 'фильмов')}`;
    battleProgress = total ? done / total : 0;
  } else if (battle?.status === 'done' && battle.rounds?.length) {
    const winner = byId.get(battle.rounds.at(-1).picks[0]);
    battleStatus = winner ? `Победитель: «${winner.title}»` : 'Турнир завершён';
    battleProgress = 1;
  }

  const progressBar = (value) => h('div', { class: 'progress' }, h('i', { style: { width: `${Math.round(value * 100)}%` } }));

  app.replaceChildren(h('section', { class: 'menu' },
    h('div', { class: 'hero' },
      h('h1', null, 'Во что сыграем?'),
      h('p', null, `${CG.plural(films.length, 'фильм', 'фильма', 'фильмов')} из архива стримов. `
        + 'У каждой игры свой прогресс, он сохраняется в этом браузере.')),
    h('div', { class: 'games' },
      h('a', { class: 'game', href: 'tierlist.html' },
        h('div', { class: 'game-art tier-art' }, tierRows.map((t) => h('div', { class: 'art-row', style: { '--c': t.color } },
          h('span', { class: 'art-label' }, t.name), h('div', { class: 'art-items' }, [0, 1, 2, 3, 4].map(() => mini(take())))))),
        h('div', { class: 'game-body' },
          h('div', { class: 'game-title' }, h('span', { class: 'game-icon' }, icon('layers', 20)), h('h2', null, 'Тир-лист')),
          h('p', null, 'Разложите просмотренные фильмы по слотам — от «рекомендую» до «плохое». '
            + 'Слоты можно переименовать, добавить и удалить, лишние фильмы — скрыть.'),
          progressBar(inGame ? placed.size / inGame : 0),
          h('div', { class: 'game-foot' }, h('span', { class: 'status' }, tierStatus),
            h('span', { class: 'btn primary' }, placed.size ? 'Продолжить' : 'Играть', ' →')))),
      h('a', { class: 'game', href: 'battle.html' },
        h('div', { class: 'game-art battle-art' },
          h('div', { class: 'vs-card left' }, CG.poster(take())), h('div', { class: 'vs-mark' }, 'VS'),
          h('div', { class: 'vs-card right' }, CG.poster(take()))),
        h('div', { class: 'game-body' },
          h('div', { class: 'game-title' }, h('span', { class: 'game-icon gold' }, icon('trophy', 20)), h('h2', null, 'Битва фильмов')),
          h('p', null, 'Два фильма — выберите лучший. Победители идут в следующий раунд: '
            + 'из 100 остаётся 50, потом 25, 13… пока не определится главный фильм.'),
          progressBar(battleProgress),
          h('div', { class: 'game-foot' }, h('span', { class: 'status' }, battleStatus),
            h('span', { class: 'btn primary' }, battle?.status === 'running' ? 'Продолжить' : 'Играть', ' →')))))));
})();
