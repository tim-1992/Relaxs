import test from 'node:test';
import assert from 'node:assert/strict';
import {HOOP,BALL_RADIUS,createShot,velocityFromAim,stepShot,predictTrajectory,scoreBasket} from '../src/hoops-physics.js';

function simulate(aim,dt=1/120) {
  const shot=createShot(velocityFromAim(aim,HOOP)), events=[];
  for(let i=0;i<Math.ceil(6/dt) && !shot.done;i++) events.push(...stepShot(shot,dt,HOOP));
  return {shot,events};
}
test('a centered calibrated arc actually travels through the hoop once',()=>{
  const {shot,events}=simulate({x:0,power:.6});
  assert.equal(shot.scored,true);
  assert.equal(events.filter(e=>e.type==='score').length,1);
  assert.equal(shot.touchedRim,false);
  assert.equal(shot.done,true);
});
test('off-axis and short shots miss rather than being snapped to a basket',()=>{
  assert.equal(simulate({x:1,power:.6}).shot.scored,false);
  assert.equal(simulate({x:0,power:.1}).shot.scored,false);
});
test('backboard contact reflects forward velocity and does not score by itself',()=>{
  const shot=createShot({x:0,y:0,z:-5});
  shot.position={x:0,y:4,z:HOOP.z-.62+BALL_RADIUS+.01};
  const events=stepShot(shot,1/60,HOOP);
  assert.equal(shot.touchedBoard,true);
  assert.ok(shot.velocity.z>0);
  assert.equal(shot.scored,false);
  assert.ok(events.some(e=>e.type==='board'));
});
test('rim contact bounces a descending ball instead of passing through metal',()=>{
  const shot=createShot({x:0,y:-3,z:0});
  shot.position={x:HOOP.x+.48,y:HOOP.y+.24,z:HOOP.z};
  stepShot(shot,1/60,HOOP);
  assert.equal(shot.touchedRim,true);
  assert.ok(shot.velocity.y>0);
  assert.equal(shot.scored,false);
});
test('floor impact retains a visible rebound and cannot fall below the court',()=>{
  const shot=createShot({x:1,y:-3,z:0});
  shot.position={x:0,y:.21,z:2};
  const events=stepShot(shot,1/60,HOOP);
  assert.ok(shot.position.y>=BALL_RADIUS);
  assert.ok(shot.velocity.y>0);
  assert.ok(events.some(e=>e.type==='floor'));
});
test('upward rim crossings never count as a goal',()=>{
  const shot=createShot({x:0,y:5,z:0});
  shot.position={x:0,y:HOOP.y-.03,z:HOOP.z};
  assert.equal(stepShot(shot,1/60,HOOP).some(e=>e.type==='score'),false);
});
test('predicted aim path is reproducible and starts from the actual held ball',()=>{
  const velocity=velocityFromAim({x:.2,power:.6},HOOP);
  const points=predictTrajectory(velocity,HOOP);
  assert.ok(points.length>15);
  assert.deepEqual(points[0],createShot(velocity).position);
  assert.deepEqual(points,predictTrajectory(velocity,HOOP));
});
test('larger frame deltas are subdivided so the ball cannot tunnel through the rim',()=>{
  const fast=simulate({x:0,power:.6},1/30);
  const fine=simulate({x:0,power:.6},1/120);
  assert.equal(fast.shot.scored,true);
  assert.equal(fast.shot.scored,fine.shot.scored);
  assert.equal(fast.events.filter(e=>e.type==='score').length,1);
});
test('combo bonuses depend on consecutive makes and reset after a miss',()=>{
  assert.deepEqual(scoreBasket({made:true,clean:true,combo:0}),{points:3,combo:1});
  assert.deepEqual(scoreBasket({made:true,clean:false,combo:2}),{points:4,combo:3});
  assert.deepEqual(scoreBasket({made:false,clean:false,combo:5}),{points:0,combo:0});
});
