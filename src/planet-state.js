export const planets = [
  {id: 'play', name: '玩一会', english: 'PLAY', color: '#a9d9cd', description: '换换脑子，让好奇心带你绕个弯。', invitation: '出发去玩', preview: '挑一个，玩得尽兴。', detail: '投几球，沿公路骑行，或寻找记忆里的线索。'},
  {id: 'calm', name: '静一会', english: 'BREATHE', color: '#b9dbe9', description: '把世界调小一点，听见自己的节奏。', invitation: '去静一会', preview: '这里，不用急。', detail: '跟随微光呼吸，或潜入一片安静的海。'},
  {id: 'release', name: '闹一会', english: 'LET GO', color: '#f1b5a1', description: '随心动动手，给心情一点回响。', invitation: '去闹一会', preview: '把紧绷，划开一点。', detail: '按住划动，切开飞起的小物件。找准时机，一刀连切。'},
];

export function stepPlanet(id, direction) {
  const index = Math.max(0, planets.findIndex(planet => planet.id === id));
  return planets[(index + Math.sign(direction) + planets.length) % planets.length].id;
}

export function readPlanetRoute(hash = '') {
  const game = /^#planet\/(play|calm|release)\/(demolition|hoops|memory|moles|ride|dive|breath|slice)$/.exec(hash);
  const homes={demolition:'release',moles:'release',slice:'release',hoops:'play',memory:'play',ride:'play',dive:'calm',breath:'calm'};
  if (game && (homes[game[2]]===game[1] || (game[1]==='play' && ['demolition','moles'].includes(game[2]))))
    return {view:'planet',planet:homes[game[2]],game:game[2]};
  if (hash === '#planet/play/stars') return {view:'planet', planet:'release', game:'demolition'};
  if (/^#planet\/play\/(tennis|target)$/.test(hash)) return {view: 'planet', planet: 'play'};
  const match = /^#(orbit|planet)\/(play|calm|release)$/.exec(hash);
  return match ? {view: match[1], planet: match[2]} : {view: 'orbit', planet: 'play'};
}

export function breathPhase(startedAt, now) {
  const seconds = (Math.max(0, now - startedAt) / 1000) % 8;
  return {
    inhaling: seconds < 4,
    expansion: (1 - Math.cos(seconds / 8 * Math.PI * 2)) / 2,
  };
}

export function planetShortcut(event, view) {
  if (event.defaultPrevented || event.isComposing || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return null;
  const target = event.target;
  if (target?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target?.tagName) ||
      target?.closest?.('[contenteditable="true"],[role="textbox"]')) return null;
  if (view === 'planet') return event.key === 'Escape' ? 'back' : null;
  if (event.key === 'ArrowLeft') return 'previous';
  if (event.key === 'ArrowRight') return 'next';
  if (event.key === 'Enter' && !event.repeat && !/^(BUTTON|A|SUMMARY)$/.test(target?.tagName) &&
      !target?.closest?.('button,a,summary')) return 'enter';
  return null;
}
