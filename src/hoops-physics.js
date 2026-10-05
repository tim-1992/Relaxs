export const HOOP = Object.freeze({x:0,y:3.35,z:-3});
export const BALL_START = Object.freeze({x:0,y:1.45,z:5.6});
export const BALL_RADIUS = .2;
export const RIM_RADIUS = .48;
export const COURT_BOUNDS = Object.freeze({minX:-5.3,maxX:5.3,minZ:-5.3,maxZ:8.2});
const GRAVITY=9.8;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const finite=(value,fallback)=>Number.isFinite(value)?value:fallback;
const copyOrigin=origin=>({
  x:finite(origin?.x,BALL_START.x),y:finite(origin?.y,BALL_START.y),z:finite(origin?.z,BALL_START.z),
});
const COURT_SPEED=2.5,POLE_OFFSET=1.13,POLE_RADIUS=.7;
const BOARD_CONTACT = {
  x:[-.95-BALL_RADIUS,.95+BALL_RADIUS],
  y:[-.1-BALL_RADIUS,1.3+BALL_RADIUS],
  z:[-.62-BALL_RADIUS,-.62+BALL_RADIUS],
};

export function createCourtPlayer() {
  return {x:BALL_START.x,z:BALL_START.z};
}

export function courtFrame(player,hoop=HOOP) {
  const origin=copyOrigin({x:player?.x,y:BALL_START.y,z:player?.z});
  const dx=finite(hoop?.x,HOOP.x)-origin.x,dz=finite(hoop?.z,HOOP.z)-origin.z;
  // Rotating local -Z by this yaw points toward the basket.
  return {origin,yaw:Math.hypot(dx,dz)>1e-10?Math.atan2(-dx,-dz):0};
}

export function stepCourtPlayer(player,{forward=0,right=0}={},dt,hoop=HOOP) {
  if(!player || !Number.isFinite(dt) || dt<=0)return false;
  const before={x:player.x,z:player.z},start=courtFrame(player,hoop).origin;
  player.x=clamp(start.x,COURT_BOUNDS.minX,COURT_BOUNDS.maxX);
  player.z=clamp(start.z,COURT_BOUNDS.minZ,COURT_BOUNDS.maxZ);
  forward=clamp(finite(forward,0),-1,1);right=clamp(finite(right,0),-1,1);
  const length=Math.hypot(forward,right);
  if(length>1){forward/=length;right/=length;}
  const duration=Math.min(dt,60),steps=Math.ceil(duration*120),h=duration/steps;
  const targetX=finite(hoop?.x,HOOP.x),targetZ=finite(hoop?.z,HOOP.z);
  const poleZ=targetZ-POLE_OFFSET;
  for(let i=0;i<steps;i++) {
    const {yaw}=courtFrame(player,hoop);
    let ahead=forward*COURT_SPEED*h;
    // Walking straight toward the exact basket center stops there instead of
    // flipping direction every frame as the facing vector crosses zero.
    if(forward>0)ahead=Math.min(ahead,Math.hypot(targetX-player.x,targetZ-player.z));
    let x=player.x-Math.sin(yaw)*ahead+Math.cos(yaw)*right*COURT_SPEED*h;
    let z=player.z-Math.cos(yaw)*ahead-Math.sin(yaw)*right*COURT_SPEED*h;
    x=clamp(x,COURT_BOUNDS.minX,COURT_BOUNDS.maxX);
    z=clamp(z,COURT_BOUNDS.minZ,COURT_BOUNDS.maxZ);
    const dx=x-targetX,dz=z-poleZ,distance=Math.hypot(dx,dz);
    if(distance<POLE_RADIUS) {
      // The scene's support is behind the rim, at hoop.z - 1.13. Use small
      // movement substeps so even a long frame cannot tunnel through its base.
      const nx=distance>1e-10?dx/distance:0,nz=distance>1e-10?dz/distance:1;
      x=targetX+nx*POLE_RADIUS;z=poleZ+nz*POLE_RADIUS;
    }
    player.x=clamp(x,COURT_BOUNDS.minX,COURT_BOUNDS.maxX);
    player.z=clamp(z,COURT_BOUNDS.minZ,COURT_BOUNDS.maxZ);
  }
  return player.x!==before.x || player.z!==before.z;
}

export function velocityFromCourtAim({x=0,power=.6}={},player=createCourtPlayer(),hoop=HOOP) {
  const strength=(clamp(finite(power,.6),.05,1)-.05)/.95;
  const yaw=courtFrame(player,hoop).yaw-clamp(finite(x,0),-1,1)*.7;
  // This power curve is independent of distance: it spans a vertical toss to
  // about 14.5m, with a high enough arc to clear the board from behind.
  const horizontal=8.5*strength;
  return {x:-Math.sin(yaw)*horizontal,y:8.5+strength,z:-Math.cos(yaw)*horizontal};
}
export const HOOPS_RELEASE_ACTION=.55;
export const HOOPS_RELEASE_DELAY=.32;
const THROW_RELEASE_TIME=HOOPS_RELEASE_DELAY,THROW_DURATION=.92;
export function createThrowMotion(charge=0) {
  const startAction=clamp(Number.isFinite(charge)?charge:0,0,1)*.22;
  return {elapsed:0,action:startAction,startAction,released:false,finished:false};
}
// Only the caller's active game clock advances this motion. The release frame
// returns the time left AFTER release, so flight never gets a full extra frame.
export function stepThrowMotion(motion,dt) {
  if(!Number.isFinite(dt)||dt<=0)return {release:false,flightTime:0};
  const duration=Math.min(dt,.1),previous=motion.elapsed;
  motion.elapsed+=duration;
  const release=!motion.released&&motion.elapsed>=THROW_RELEASE_TIME;
  if(release)motion.released=true;
  motion.finished=motion.elapsed>=THROW_DURATION;
  motion.action=motion.finished?1:motion.elapsed<THROW_RELEASE_TIME
    ?motion.startAction+(HOOPS_RELEASE_ACTION-motion.startAction)*motion.elapsed/THROW_RELEASE_TIME
    :HOOPS_RELEASE_ACTION+(1-HOOPS_RELEASE_ACTION)*(motion.elapsed-THROW_RELEASE_TIME)/(THROW_DURATION-THROW_RELEASE_TIME);
  const flightTime=motion.released?Math.min(duration,Math.max(0,motion.elapsed-Math.max(previous,THROW_RELEASE_TIME))):0;
  return {release,flightTime};
}
export function velocityFromAim({x=0,power=.6}={}) {
  const strength=clamp(Number.isFinite(power)?power:.6,.05,1);
  return {x:clamp(Number.isFinite(x)?x:0,-1,1)*2.8,y:6+strength*3.2,z:-(5.9+strength*.95)};
}
export function createShot(velocity,{wind={},origin=BALL_START}={}) {
  return {position:copyOrigin(origin),velocity:{...velocity},age:0,scored:false,
    wind:{x:clamp(Number.isFinite(wind?.x)?wind.x:0,-2,2),z:clamp(Number.isFinite(wind?.z)?wind.z:0,-2,2)},
    crossing:null,crossingHoop:null,touchedRim:false,touchedBoard:false,done:false,grounded:false,resolvedAt:null,lastImpact:-1};
}
const targetAt=(target,age)=>typeof target==='function'?{...target(age)}:target;
function advance(shot,h,target,events) {
  const p=shot.position,v=shot.velocity,prev={...p};
  const previousAge=shot.age,previousHoop=targetAt(target,previousAge);
  const hoop=targetAt(target,previousAge+h);
  const hoopVelocity={x:(hoop.x-previousHoop.x)/h,y:(hoop.y-previousHoop.y)/h,z:(hoop.z-previousHoop.z)/h};
  const wind=shot.grounded||shot.scored?{x:0,z:0}:shot.wind;
  p.x+=v.x*h+wind.x*h*h/2;p.y+=v.y*h-GRAVITY*h*h/2;p.z+=v.z*h+wind.z*h*h/2;
  v.x+=wind.x*h;v.y-=GRAVITY*h;v.z+=wind.z*h;
  shot.age+=h;
  const impact=(type,power)=>{
    if(shot.age-shot.lastImpact>.045) {
      events.push({type,position:{...p},power});
      shot.lastImpact=shot.age;
    }
  };
  // Keep both broad faces and the finite board edges solid when a free-court
  // player shoots from beside, beneath or behind the basket.
  board: for(const axis of ['z','x','y']) for(const side of [1,-1]) {
    const edge=BOARD_CONTACT[axis][side>0?1:0];
    const previousBoardDistance=(prev[axis]-(previousHoop[axis]+edge))*side;
    const boardDistance=(p[axis]-(hoop[axis]+edge))*side;
    if(previousBoardDistance>=0 && boardDistance<0 && (v[axis]-hoopVelocity[axis])*side<0) {
      const t=previousBoardDistance/(previousBoardDistance-boardDistance);
      const contactHoop=targetAt(target,previousAge+h*t);
      const onBoard=['x','y','z'].every(other=>{
        if(other===axis)return true;
        const value=prev[other]+(p[other]-prev[other])*t-contactHoop[other];
        return value>BOARD_CONTACT[other][0] && value<BOARD_CONTACT[other][1];
      });
      if(onBoard) {
        p[axis]=hoop[axis]+edge+side*.001;
        for(const other of ['x','y','z']) {
          v[other]=hoopVelocity[other]+(v[other]-hoopVelocity[other])*(other===axis?-.68:.96);
        }
        shot.touchedBoard=true;impact('board',Math.abs(v[axis]-hoopVelocity[axis]));
        break board;
      }
    }
  }
  const dx=p.x-hoop.x,dz=p.z-hoop.z,radial=Math.hypot(dx,dz);
  if(radial>.00001) {
    const nearest={x:hoop.x+dx/radial*RIM_RADIUS,y:hoop.y,z:hoop.z+dz/radial*RIM_RADIUS};
    const nx=p.x-nearest.x,ny=p.y-nearest.y,nz=p.z-nearest.z,d=Math.hypot(nx,ny,nz);
    const contact=BALL_RADIUS+.035;
    if(d<contact && d>.00001) {
      const n={x:nx/d,y:ny/d,z:nz/d};
      const dot=(v.x-hoopVelocity.x)*n.x+(v.y-hoopVelocity.y)*n.y+(v.z-hoopVelocity.z)*n.z;
      p.x=nearest.x+n.x*(contact+.001);p.y=nearest.y+n.y*(contact+.001);p.z=nearest.z+n.z*(contact+.001);
      if(dot<0) {
        const bounce=1.65*dot;
        v.x-=bounce*n.x;v.y-=bounce*n.y;v.z-=bounce*n.z;
        shot.touchedRim=true;impact('rim',Math.abs(dot));
      }
    }
  }
  // Only a downward crossing through the opening counts; never an upward
  // bounce, a hit on the rim, or a visually nearby ball.
  const previousHeight=prev.y-previousHoop.y,height=p.y-hoop.y;
  if(!shot.scored && !shot.grounded && previousHeight>0 && height<=0 && v.y-hoopVelocity.y<0) {
    const t=previousHeight/(previousHeight-height);
    const crossingHoop=targetAt(target,previousAge+h*t);
    const cx=prev.x+(p.x-prev.x)*t,cz=prev.z+(p.z-prev.z)*t;
    if(!shot.crossing) {
      shot.crossing={x:cx,y:crossingHoop.y,z:cz};
      shot.crossingHoop={...crossingHoop};
    }
    if(Math.hypot(cx-crossingHoop.x,cz-crossingHoop.z)<RIM_RADIUS-BALL_RADIUS-.01) {
      shot.scored=true;shot.resolvedAt=shot.age;
      events.push({type:'score',position:{...crossingHoop},clean:!shot.touchedRim&&!shot.touchedBoard,power:1});
      v.x*=.5;v.z*=.45; // Net slows an already-made ball, never redirects a shot into the basket.
    }
  }
  if(p.y<BALL_RADIUS) {
    p.y=BALL_RADIUS;
    if(v.y<0) {
      const speed=-v.y;
      v.y=speed*.56;v.x*=.72;v.z*=.72;
      if(speed>.45) impact('floor',speed);
    }
    shot.grounded=true;
    if(shot.resolvedAt===null)shot.resolvedAt=shot.age;
  }
  if(shot.resolvedAt!==null && shot.age-shot.resolvedAt>.9 || shot.age>5 || Math.abs(p.x)>12 || p.z<-12 || p.z>14)shot.done=true;
}
// A target callback receives seconds since ball release. Sample it throughout
// flight and again at fractional contact/crossing times; it must be pure.
export function stepShot(shot,dt,hoop=HOOP) {
  if(shot.done || !Number.isFinite(dt) || dt<=0)return [];
  const events=[],duration=Math.min(dt,.1),steps=Math.ceil(duration/(1/240)),h=duration/steps;
  for(let i=0;i<steps && !shot.done;i++)advance(shot,h,hoop,events);
  return events;
}
export function predictTrajectory(velocity,hoop=HOOP,{wind,maxTime=1.8,origin=BALL_START}={}) {
  const shot=createShot(velocity,{wind,origin}),points=[{...shot.position}];
  const samples=Math.round(clamp(Number.isFinite(maxTime)?maxTime:1.8,0,1.8)/.05);
  for(let i=0;i<samples && !shot.done;i++) {
    stepShot(shot,.05,hoop);
    points.push({...shot.position});
    if(shot.scored || shot.grounded)break;
  }
  return points;
}
export function scoreBasket({made,clean,combo=0}) {
  if(!made)return {points:0,combo:0};
  const next=combo+1;
  return {points:2+(clean?1:0)+Math.min(3,next-1),combo:next};
}
