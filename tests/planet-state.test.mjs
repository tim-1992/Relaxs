import test from 'node:test';
import assert from 'node:assert/strict';
import {readPlanetRoute, stepPlanet, planetShortcut, breathPhase} from '../src/planet-state.js';

test('planet selection wraps in both directions without losing a destination', () => {
  assert.equal(stepPlanet('play', -1), 'release');
  assert.equal(stepPlanet('release', 1), 'play');
  assert.equal(stepPlanet('play', 1), 'calm');
  assert.equal(stepPlanet('calm', 1), 'release');
});

test('deep links distinguish a selected planet from an entered experience', () => {
  assert.deepEqual(readPlanetRoute('#orbit/release'), {view: 'orbit', planet: 'release'});
  assert.deepEqual(readPlanetRoute('#planet/calm'), {view: 'planet', planet: 'calm'});
  assert.deepEqual(readPlanetRoute('#planet/play'), {view: 'planet', planet: 'play'});
  assert.deepEqual(readPlanetRoute(''), {view: 'orbit', planet: 'play'});
  assert.deepEqual(readPlanetRoute('#planet/missing'), {view: 'orbit', planet: 'play'});
  assert.deepEqual(readPlanetRoute('#planet/play/extra'), {view: 'orbit', planet: 'play'});
  for (const game of ['hoops', 'memory','ride']) {
    assert.deepEqual(readPlanetRoute(`#planet/play/${game}`), {view: 'planet', planet: 'play', game});
  }
  assert.deepEqual(readPlanetRoute('#planet/calm/tennis'), {view: 'orbit', planet: 'play'});
});

test('the replaced route puzzle opens the new demolition workshop', () => {
  assert.deepEqual(readPlanetRoute('#planet/play/stars'), {view:'planet',planet:'release',game:'demolition'});
});

test('experiences belong to their planets and older play links keep working',()=>{
  for(const [planet,games] of Object.entries({calm:['breath','dive'],release:['demolition','moles','slice']})) {
    for(const game of games)assert.deepEqual(readPlanetRoute(`#planet/${planet}/${game}`),{view:'planet',planet,game});
  }
  for(const game of ['demolition','moles'])assert.deepEqual(readPlanetRoute(`#planet/play/${game}`),{view:'planet',planet:'release',game});
  assert.deepEqual(readPlanetRoute('#planet/release/hoops'),{view:'orbit',planet:'play'});
});

test('retired tennis and target deep links return to the main play library', () => {
  for (const game of ['tennis', 'target']) {
    assert.deepEqual(readPlanetRoute(`#planet/play/${game}`), {view: 'planet', planet: 'play'});
  }
});

test('shortcuts select in the lobby and leave an experience without changing its planet', () => {
  assert.equal(planetShortcut({key: 'ArrowLeft'}, 'orbit'), 'previous');
  assert.equal(planetShortcut({key: 'ArrowRight'}, 'orbit'), 'next');
  assert.equal(planetShortcut({key: 'Enter'}, 'orbit'), 'enter');
  assert.equal(planetShortcut({key: 'ArrowRight'}, 'planet'), null);
  assert.equal(planetShortcut({key: 'Escape'}, 'planet'), 'back');
  assert.equal(planetShortcut({key: 'Enter', repeat: true}, 'orbit'), null);
});

test('text entry, composition and browser shortcuts are not intercepted', () => {
  for (const tagName of ['INPUT', 'TEXTAREA', 'SELECT']) {
    assert.equal(planetShortcut({key: 'ArrowRight', target: {tagName}}, 'orbit'), null);
  }
  assert.equal(planetShortcut({key: 'ArrowLeft', target: {isContentEditable: true}}, 'orbit'), null);
  for (const property of ['ctrlKey', 'metaKey', 'altKey', 'shiftKey', 'isComposing', 'defaultPrevented']) {
    assert.equal(planetShortcut({key: 'ArrowRight', [property]: true}, 'orbit'), null);
  }
});

test('native button and link activation cannot accidentally enter the current planet', () => {
  for (const tagName of ['BUTTON', 'A', 'SUMMARY']) {
    assert.equal(planetShortcut({key: 'Enter', target: {tagName}}, 'orbit'), null);
  }
  assert.equal(planetShortcut({key: 'Enter', target: {tagName: 'BODY'}}, 'orbit'), 'enter');
});

test('breathing cues follow elapsed time even when rendering skips frames', () => {
  assert.deepEqual(breathPhase(1000, 1000), {inhaling: true, expansion: 0});
  assert.deepEqual(breathPhase(1000, 5000), {inhaling: false, expansion: 1});
  const afterSkippedFrames = breathPhase(1000, 7000);
  assert.equal(afterSkippedFrames.inhaling, false);
  assert.ok(Math.abs(afterSkippedFrames.expansion - .5) < 1e-10);
  assert.deepEqual(breathPhase(1000, 9000), {inhaling: true, expansion: 0});
});
