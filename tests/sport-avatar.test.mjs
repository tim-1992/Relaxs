import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {SPORT_CHARACTERS, createSportAvatar} from '../src/sport-avatar.js';

test('sports share three selectable 3D characters with real racket geometry', () => {
  assert.equal(SPORT_CHARACTERS.length, 3);
  const avatar = createSportAvatar({sport: 'tennis'});
  assert.ok(avatar.group instanceof THREE.Group);
  for (const character of SPORT_CHARACTERS) {
    avatar.setCharacter(character.id);
    assert.ok(avatar.group.getObjectByName('racket-head') instanceof THREE.Mesh);
    assert.equal(avatar.group.userData.character, character.id);
  }
  avatar.dispose();
});

test('swing and shot animation move actual hand joints and return to the ready pose', () => {
  for (const sport of ['tennis', 'basketball']) {
    const avatar = createSportAvatar({sport});
    avatar.update({time: 0, move: 0, action: 0});
    const ready = avatar.getGripPosition().clone();
    avatar.update({time: 0, move: 0, action: .55});
    const active = avatar.getGripPosition().clone();
    assert.ok(active.distanceTo(ready) > .15, `${sport} must move the hand in 3D`);
    avatar.update({time: 0, move: 0, action: 1});
    assert.ok(avatar.getGripPosition().distanceTo(ready) < 1e-8);
    avatar.dispose();
  }
});

test('changing character disposes previous geometry and keeps animation usable', () => {
  const avatar = createSportAvatar();
  const old = avatar.group.getObjectByName('avatar-head').geometry;
  let disposed = false;
  old.addEventListener('dispose', () => { disposed = true; });
  avatar.setCharacter('robot');
  assert.equal(disposed, true);
  avatar.update({time: 2, move: 1, action: .5});
  assert.ok(avatar.getGripPosition().toArray().every(Number.isFinite));
  avatar.dispose();
  avatar.dispose();
});

test('basketball preparation bends knee joints then straightens them for release', () => {
  const avatar = createSportAvatar({sport: 'basketball'});
  avatar.update({action: .22});
  assert.ok(avatar.group.getObjectByName('left-knee').rotation.x < -.8);
  assert.ok(avatar.group.getObjectByName('right-knee').rotation.x < -.8);
  avatar.update({action: .55});
  assert.ok(Math.abs(avatar.group.getObjectByName('left-knee').rotation.x) < 1e-8);
  avatar.dispose();
});
