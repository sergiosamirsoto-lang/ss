// ═══════════════════════════════════════════════════════════════
// MORTAL KOMBAT CHINO — Complete Edition
// ═══════════════════════════════════════════════════════════════

const canvas = document.getElementById('gc');
const ctx = canvas.getContext('2d');
const sc = document.getElementById('select-canvas');
const sctx = sc.getContext('2d');
const W = 960, H = 540, GND = 440, GRAV = .62, WL = 30, WR = 930;

const $ = id => document.getElementById(id);
const hud = { hp:[$('hud-p1-hp'),$('hud-p2-hp')], dmg:[$('hud-p1-dmg'),$('hud-p2-dmg')],
  meter:[$('hud-p1-meter'),$('hud-p2-meter')], name:[$('hud-p1-name'),$('hud-p2-name')],
  timer:$('hud-timer'), round:$('hud-round'), score:$('hud-score') };
const comboText = $('combo-text'), overlay = $('msg-overlay');
const msgTitle = $('msg-title'), msgSub = $('msg-sub');
const rstBtn = $('restart-btn'), menuBtn = $('menu-btn');
let socket = null;
let isMultiplayer = false;
let myRole = null;
let finishHimTimer = 0;
let finishHimState = false;
function show(s){s.classList.remove('hidden')}
function hide(s){s.classList.add('hidden')}
function rand(a,b){return a+Math.random()*(b-a)}
function clamp(v,mn,mx){return Math.max(mn,Math.min(mx,v))}

// ─── SPRITE SYSTEM ────────────────────────────────────────────
const FW=128, FH=128; // Frame size
const SPR={}; // Loaded images: SPR[spriteType][animName] = Image
const SPR_ANIM={}; // Animation data: SPR_ANIM[spriteType][state] = {frames,speed}

function defineAnim(type,state,fileName,frames,speed,loop=true){
  if(!SPR_ANIM[type])SPR_ANIM[type]={};
  SPR_ANIM[type][state]={fileName,frames,speed,loop};
}

defineAnim('samurai','idle','Idle',6,0.12);
defineAnim('samurai','walk','Walk',9,0.1);
defineAnim('samurai','run','Run',8,0.08);
defineAnim('samurai','attack1','Attack_1',4,0.2,false);
defineAnim('samurai','attack2','Attack_2',5,0.2,false);
defineAnim('samurai','attack3','Attack_3',4,0.2,false);
defineAnim('samurai','jump','Jump',9,0.08,false);
defineAnim('samurai','hurt','Hurt',3,0.1,false);
defineAnim('samurai','dead','Dead',6,0.1,false);
defineAnim('samurai','block','Protection',2,0.08);

defineAnim('archer','idle','Idle',9,0.12);
defineAnim('archer','walk','Walk',8,0.1);
defineAnim('archer','run','Run',8,0.08);
defineAnim('archer','attack1','Attack_1',5,0.2,false);
defineAnim('archer','attack2','Attack_2',5,0.2,false);
defineAnim('archer','attack3','Attack_3',6,0.2,false);
defineAnim('archer','jump','Jump',9,0.08,false);
defineAnim('archer','hurt','Hurt',3,0.1,false);
defineAnim('archer','dead','Dead',5,0.1,false);
defineAnim('archer','block','Protection',2,0.08);

defineAnim('commander','idle','Idle',5,0.12);
defineAnim('commander','walk','Walk',9,0.1);
defineAnim('commander','run','Run',8,0.08);
defineAnim('commander','attack1','Attack_1',4,0.2,false);
defineAnim('commander','attack2','Attack_2',5,0.2,false);
defineAnim('commander','attack3','Attack_3',4,0.2,false);
defineAnim('commander','jump','Jump',7,0.08,false);
defineAnim('commander','hurt','Hurt',2,0.1,false);
defineAnim('commander','dead','Dead',6,0.1,false);
defineAnim('commander','block','Protect',2,0.08);

const CHAR_SPRITE={
  catracho:'samurai',pijudo:'archer',maje:'commander',
};

const SPR_TYPES=['samurai','archer','commander'];
const SPR_FOLDERS={samurai:'Samurai',archer:'Samurai_Archer',commander:'Samurai_Commander'};

let spritesLoaded=false;
function loadSprites(callback){
  const total=SPR_TYPES.length;
  let loaded=0;
  for(const type of SPR_TYPES){
    if(!SPR[type])SPR[type]={};
    const folder=SPR_FOLDERS[type];
    const anims=SPR_ANIM[type];
    const names=new Set();
    for(const key in anims)names.add(anims[key].fileName);
    let typeLoaded=0;
    const typeTotal=names.size;
    for(const fn of names){
      const img=new Image();
      img.onload=()=>{typeLoaded++;if(typeLoaded>=typeTotal){loaded++;if(loaded>=total){spritesLoaded=true;if(callback)callback()}}};
      img.onerror=()=>{typeLoaded++;if(typeLoaded>=typeTotal){loaded++;if(loaded>=total){spritesLoaded=true;if(callback)callback()}}};
      img.src=`personajes/${folder}/${fn}.png`;
      SPR[type][fn]=img;
    }
  }
}

// ─── FRAME WIDTH CACHE ────────────────────────────────────────
const SPR_FW={}; // SPR_FW[spriteType][fileName] = frameWidth
function getFrameW(type,fileName,frames){
  const t=SPR_FW[type]||(SPR_FW[type]={});
  if(t[fileName]!==undefined)return t[fileName];
  const img=SPR[type]?.[fileName];
  if(img&&img.complete&&img.naturalWidth>0){
    t[fileName]=img.naturalWidth/frames;
    return t[fileName];
  }
  return FW;
}

// ─── ANIMATION ────────────────────────────────────────────────
class SpriteAnim {
  constructor(spriteType){
    this.type=spriteType;
    this.state='idle';
    this.frame=0;
    this.timer=0;
    this.playing=true;
  }
  play(state){
    if(this.state!==state){
      this.state=state;
      this.timer=0;
      this.frame=0;
      this.playing=true;
    }
  }
  update(speedMul){
    const anim=SPR_ANIM[this.type]?.[this.state];
    if(!anim||!this.playing)return;
    this.timer+=anim.speed*speedMul;
    if(this.timer>=anim.frames){
      if(anim.loop)this.timer-=anim.frames;
      else{this.timer=anim.frames-.001;this.playing=false}
    }
    this.frame=this.timer|0;
  }
  get isFinished(){return !this.playing}
}

// ─── HELPER DRAW ──────────────────────────────────────────────
function roundRectPath(ctx,x,y,w,h,r){
  ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.quadraticCurveTo(x+w,y,x+w,y+r);
  ctx.lineTo(x+w,y+h-r);ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
  ctx.lineTo(x+r,y+h);ctx.quadraticCurveTo(x,y+h,x,y+h-r);
  ctx.lineTo(x,y+r);ctx.quadraticCurveTo(x,y,x+r,y);
}

// ─── KEY CONSTANTS ────────────────────────────────────────────
// P1: WASD + J(bl) U(hp) K(lk) I(hk) Space(bl)
// P2: Arrows + 1(lp) 2(hp) 3(lk) 4(hk) 5(bl)
const KEYS = {
  p1: {u:'w',d:'s',f:'d',b:'a',lp:'j',hp:'u',lk:'k',hk:'i',bl:' ',start:'Enter'},
  p2: {u:'ArrowUp',d:'ArrowDown',f:'ArrowRight',b:'ArrowLeft',lp:'1',hp:'2',lk:'3',hk:'4',bl:'5',start:'Enter'}
};

// ─── CHARACTER DATA ───────────────────────────────────────────
const CHARS = {
  catracho:{name:'El Catracho',cs:{torso:'#0044aa',pants:'#002255',belt:'#c80',skin:'#d4a574',boot:'#3a1a0a',gloves:'#0033aa',hair:'#222',headband:false},
    moves:[
      {inp:['B','B','LP'],name:'El Gancho',dmg:12,desc:'B,B+LP'},
      {inp:['D','B','HP'],name:'El Brinco',dmg:0,desc:'D,B+HP'},
      {inp:['D','F','HP'],name:'El Zape',dmg:0,desc:'D,F+HP'},
      {inp:['F','D','B','LK'],name:'Trancazo',dmg:10,desc:'F,D,B+LK'},
      {inp:['U','U','HP'],name:'La Cayetana',dmg:50,desc:'U,U+HP (Fatality)'},
    ]},
  pijudo:{name:'El Pijudo',cs:{torso:'#8b0000',pants:'#3a0000',belt:'#888',skin:'#e8c090',boot:'#223344',gloves:'#4a0000',hair:'#445',headband:false},
    moves:[
      {inp:['D','F','LP'],name:'El Frío',dmg:10,desc:'D,F+LP'},
      {inp:['D','B','LK'],name:'Agarrón',dmg:8,desc:'D,B+LK'},
      {inp:['B','LK','HK'],name:'Pase Shuco',dmg:9,desc:'B+LK+HK'},
      {inp:['F','F','D','HK'],name:'Golpe Chafa',dmg:14,desc:'F,F,D+HK'},
    ]},
  maje:{name:'El Maje',cs:{torso:'#884400',pants:'#442200',belt:'#ff0',skin:'#d4a574',boot:'#221100',gloves:'#884400',hair:'#fff',headband:false},
    moves:[
      {inp:['B','B','F'],name:'El Macanazo',dmg:11,desc:'B,B,F'},
      {inp:['D','F','LP'],name:'Rayo',dmg:9,desc:'D,F+LP'},
      {inp:['D','U'],name:'El Brinco',dmg:0,desc:'D+U'},
    ]},
};
const CHAR_IDS = Object.keys(CHARS);
const CHAR_NAMES = CHAR_IDS.map(id=>CHARS[id].name);

// ─── INPUT BUFFER ─────────────────────────────────────────────
class IB {
  constructor(){this.buf=[];this.max=40;this.pressed={}}
  add(d){this.buf.push(d);if(this.buf.length>this.max)this.buf.shift()}
  press(b){this.pressed[b]=true}
  clear(){this.pressed={}}
  consume(b){const r=this.pressed[b];this.pressed[b]=false;return r}
  match(p){
    const btn=p[p.length-1];
    if(!this.consume(btn))return null;
    const dirs=p.slice(0,-1).map(s=>s.toUpperCase());
    // Clean: remove consecutive dupes, keep only cardinal dirs from diagonals
    const clean=[];let prev='';
    for(const d of this.buf){
      let c=d;
      if(d==='UF'||d==='DF')c=d.includes('U')?'U':'F';
      else if(d==='UB'||d==='DB')c=d.includes('U')?'U':'B';
      if(c!==prev){clean.push(c);prev=c}
    }
    let ci=clean.length-1;
    for(let i=dirs.length-1;i>=0;i--){
      while(ci>=0&&clean[ci]!==dirs[i])ci--;
      if(ci<0)return null;ci--;
    }
    return p;
  }
}

// ─── FIGHTER ──────────────────────────────────────────────────
class Fighter {
  constructor(id,facing){
    const d=CHARS[id];
    this.id=id;this.name=d.name;this.cs=d.cs;
    this.facing=facing;this.x=facing?220:740;this.y=GND;
    this.vx=0;this.vy=0;this.w=100;this.h=200;
    this.onGround=true;this.hp=100;this.maxHp=100;
    this.meter=0;this.maxMeter=5;this.speed=4;
    this.state='idle';this.move=null;
    this.moveTimer=0;this.movePhase='none';
    this.blocking=false;this.crouching=false;this.hitstun=0;
    this.canCancel=false;this.invuln=0;
    this.airMoves=0;this.maxAirMoves=1;
    this.breath=0;this.inp=new IB();
    this.comboCount=0;this.comboTimer=0;
    this.chargeDir=null;this.chargeTimer=0;
    this.attackDmg=0;this.attackName='';
    this.animTimer=0;
    this.attackCooldown=0;
    this.blocksRemaining=2;
    this.spriteType=CHAR_SPRITE[id]||'samurai';
    this.sprite=new SpriteAnim(this.spriteType);
  }
  reset(x,facing){
    this.x=x;this.y=GND;this.vx=0;this.vy=0;
    this.facing=facing;this.onGround=true;
    this.hp=100;this.meter=0;this.state='idle';
    this.move=null;this.moveTimer=0;this.movePhase='none';
    this.blocking=false;this.crouching=false;this.hitstun=0;
    this.canCancel=false;this.invuln=0;
    this.airMoves=0;this.breath=0;this.inp=new IB();
    this.comboCount=0;this.comboTimer=0;
    this.attackDmg=0;this.attackName='';
    this.attackCooldown=0;
    this.blocksRemaining=2;
    this.sprite=new SpriteAnim(this.spriteType);
  }
  get left(){return this.x-this.w/2}
  get right(){return this.x+this.w/2}
  get top(){return this.y-this.h}
  get locked(){return this.state==='hitstun'||this.state==='blockstun'}

  startBlock(b){
    this.blocking=b&&!this.locked&&this.onGround;
  }

  doBasic(btn,dmg){
    if(this.locked||this.invuln>0||!this.onGround||this.attackCooldown>0)return false;
    if(this.state==='attack')return false;
    this.state='attack';this.movePhase='startup';
    this.moveTimer=0;this.attackDmg=dmg;
    this.attackName=btn;this.canCancel=false;
    return true;
  }

  trySpecial(){
    if(this.locked||this.invuln>0||this.attackCooldown>0)return false;
    const cd=CHARS[this.id];
    if(!cd||!cd.moves)return false;
    for(const m of cd.moves){
      if(this.inp.match(m.inp)){
        this.state='attack';this.movePhase='startup';
        this.moveTimer=0;this.attackDmg=m.dmg;
        this.attackName=m.name;this.canCancel=false;
        this.move=m;
        return true;
      }
    }
    return false;
  }

  takeHit(dmg,stun,knock,blocked){
    if(this.invuln>0)return;
    if(blocked){
      this.blocksRemaining--;
      if(this.blocksRemaining<0){
        // Guard Break!
        this.blocking=false;
        spawnP(this.x,this.y-100,20,'#44f',{spread:1.5,spark:true});
        // Proceed to take full hit below
      }else{
        this.hp=Math.max(0,this.hp-0); // 100% block
        this.state='blockstun';this.hitstun=stun;
        this.vx=knock*.3;
        this.meter=Math.min(this.maxMeter,this.meter+.5);
        return;
      }
    }
    this.hp=Math.max(0,this.hp-dmg);
    this.state='hitstun';this.hitstun=stun;
    this.vx=knock;this.vy=-3;
    this.meter=Math.min(this.maxMeter,this.meter+1);
    this.invuln=10;
  }

  getAnimState(){
    if(this.state==='hitstun')return this.hp<=0?'dead':'hurt';
    if(this.state==='blockstun')return 'block';
    if(this.state==='attack'){
      if(this.attackName==='LP')return 'attack1';
      if(this.attackName==='HP')return 'attack2';
      if(this.attackName==='LK'||this.attackName==='HK')return 'attack3';
      return 'attack1';
    }
    if(!this.onGround)return 'jump';
    if(this.crouching)return 'idle'; // Visual squash happens in draw
    if(this.state==='idle'){
      if(Math.abs(this.vx)>3)return 'run';
      if(Math.abs(this.vx)>0.5)return 'walk';
      return 'idle';
    }
    return 'idle';
  }

    this.breath+=.03;
    if(this.invuln>0)this.invuln--;
    if(this.attackCooldown>0)this.attackCooldown--;
    if(this.state==='idle')this.blocksRemaining=2;

    if(!this.onGround){this.vy+=GRAV;this.y+=this.vy}
    else {
      this.y=GND;
      this.vx*=.85; // Friction only on ground
    }
    
    if(this.y>=GND){this.y=GND;this.vy=0;this.onGround=true}
    this.x+=this.vx;
    this.x=clamp(this.x,WL+this.w/2,WR-this.w/2);
    if(Math.abs(this.vx)<.3)this.vx=0;

    if(this.state==='hitstun'||this.state==='blockstun'){
      this.hitstun--;if(this.hitstun<=0)this.state='idle';
    }else if(this.state==='attack'){
      this.moveTimer++;
      const startup=8,active=4,recovery=10;
      if(this.movePhase==='startup'&&this.moveTimer>=startup){
        this.movePhase='active';this.moveTimer=0;
        if(this.attackName==='El Frío'||this.attackName==='Rayo') spawnProj(this);
      }else if(this.movePhase==='active'&&this.moveTimer>=active){
        this.movePhase='recovery';this.moveTimer=0;
      }else if(this.movePhase==='recovery'&&this.moveTimer>=recovery){
        this.state='idle';this.attackDmg=0;this.attackName='';this.move=null;
        this.attackCooldown=15; // Anti-spam cooldown
      }
    }

    const animState=this.getAnimState();
    this.sprite.play(animState);
    this.sprite.update(1);
  }

  getActiveBox(){
    if(this.state!=='attack'||this.movePhase!=='active')return null;
    const d=this.facing?1:-1;
    return{x:this.facing ? this.x+70 : this.x-170, y:this.y-200, w:100, h:160};
  }

  draw(ctx){
    const f=this.facing?1:-1;
    const flash=this.hitstun>0&&(this.hitstun/3&1|0);
    ctx.save();ctx.translate(this.x|0,(this.y+Math.sin(this.breath)*1.2)|0);

    if(this.crouching) {
      ctx.translate(0, 40);
      ctx.scale(1, 0.7);
    }

    ctx.fillStyle='rgba(0,0,0,.35)';
    ctx.beginPath();ctx.ellipse(0,4,28,7,0,0,Math.PI*2);ctx.fill();

    const animData=SPR_ANIM[this.spriteType]?.[this.sprite.state];
    if(animData){
      const img=SPR[this.spriteType]?.[animData.fileName];
      if(img&&img.complete&&img.naturalWidth>0){
        const fw=getFrameW(this.spriteType,animData.fileName,animData.frames);
        const fr=this.sprite.frame<animData.frames?this.sprite.frame:0;
        ctx.translate(0,-320);
        if(f<0) ctx.scale(-1,1);
        if(flash) {
          ctx.globalCompositeOperation = 'source-over';
          // simple flash effect by alternating opacity
          ctx.globalAlpha = 0.5;
        }
        ctx.drawImage(img,fr*fw|0,0,fw,FH,-160,0,320,320);
        ctx.globalAlpha = 1.0;
      }
    }
    ctx.restore();
  }


}

// ─── PARTICLES ────────────────────────────────────────────────
let particles=[];
function spawnP(x,y,c,color,opts){
  for(let i=0;i<c;i++){
    const a=rand(0,Math.PI*2),spd=rand(2,12);
    particles.push({x,y,color,
      vx:Math.cos(a)*spd*(opts?.spread||1),
      vy:Math.sin(a)*spd*(opts?.spread||1)-2,
      life:rand(15,40),maxLife:40,size:rand(2,6),
      gravity:opts?.gravity??.3,shrink:opts?.shrink??true,spark:opts?.spark??false});
  }
}
function updP(){
  for(let i=particles.length-1;i>=0;i--){
    const p=particles[i];
    p.x+=p.vx;p.y+=p.vy;p.vy+=p.gravity;
    p.life--;if(p.shrink)p.size*=.96;
    if(p.life<=0||p.size<.3)particles.splice(i,1);
  }
}
function drawP(){
  for(const p of particles){
    const a=p.life/p.maxLife;
    if(p.spark){ctx.globalAlpha=a*2;ctx.strokeStyle=p.color;ctx.lineWidth=p.size;
      ctx.beginPath();ctx.moveTo(p.x-p.vx*5,p.y-p.vy*5);ctx.lineTo(p.x,p.y);ctx.stroke();
    }else{ctx.globalAlpha=a;ctx.fillStyle=p.color;
      ctx.beginPath();ctx.arc(p.x,p.y,Math.max(.5,p.size*a),0,Math.PI*2);ctx.fill();
    }
  }ctx.globalAlpha=1;
}
let projectiles=[];
const arrowImg=new Image();arrowImg.src='personajes/Samurai_Archer/Arrow.png';
function spawnProj(f){
  const d=f.facing?1:-1;
  projectiles.push({x:f.x+d*60,y:f.y-140,vx:d*9,vy:0,w:24,h:8,life:60,owner:f,hit:false,dmg:10,
    spriteType:f.spriteType});
}
function updProj(){
  for(let i=projectiles.length-1;i>=0;i--){
    const p=projectiles[i];p.x+=p.vx;p.life--;
    if(p.x<WL-20||p.x>WR+20||p.life<=0){projectiles.splice(i,1);continue}
    const t=p.owner===f1?f2:f1;
    if(!p.hit&&Math.abs(p.x-t.x)<35&&Math.abs(p.y-(t.y-100))<80){
      p.hit=true;const b=t.blocking;
      t.takeHit(p.dmg,b?10:22,b?2:(p.x>t.x?1:-1)*8,b);
      spawnP(p.x,p.y,15,'#f80',{spark:true,spread:1.2});
      if(!b)spawnP(p.x,p.y,10,'#fff',{spread:.8});
      hitstop=5;shakeX=(Math.random()-.5)*10;shakeY=(Math.random()-.5)*5;
      projectiles.splice(i,1);
    }
  }
}
function drawProj(){
  for(const p of projectiles){
    ctx.save();ctx.translate(p.x,p.y);
    const d=p.owner.facing?1:-1;
    if(p.spriteType==='archer'&&arrowImg.complete&&arrowImg.naturalWidth>0){
      ctx.scale(d,1);
      ctx.drawImage(arrowImg,-16,-8,32,16);
    }else{
      ctx.fillStyle='#f80';ctx.shadowColor='#f80';ctx.shadowBlur=15;
      ctx.fillRect(-12,-3,24,6);ctx.shadowBlur=0;
    }
    ctx.restore();
  }
}

// ─── GAME STATE ───────────────────────────────────────────────
let f1,f2,state='menu',stateTimer=0,roundOver=false;
let timer=99,round=1,p1Wins=0,p2Wins=0;
let hitstop=0,shakeX=0,shakeY=0;
let comboCount=0,comboOwner=null,comboTimer=0;
let mode='1p',keys={},dmgDisplay=[];
let selP1=0,selP2=1,selR1=false,selR2=false;
let menuSel=0,menuCD=0;
let selCD1=0,selCD2=0,fightStartTimer=0;

// ─── AI ────────────────────────────────────────────────────────
function runAI(p,o){
  if(p.locked||p.state==='attack')return;
  p.crouching=false;
  const d=o.x-p.x,ab=Math.abs(d),dir=d>0?1:-1,r=Math.random();
  if(p.onGround){
    if(ab>150){p.vx=dir*p.speed;p.facing=dir>0}
    else if(ab<80&&!o.blocking){p.vx=-dir*2;p.facing=-dir>0}
    else{p.vx*=.8;if(Math.abs(p.vx)<.3)p.vx=0}
    if(ab>250&&r<.03){p.vy=-10;p.onGround=false}
  }
  p.blocking=ab<180&&o.state==='attack'&&r<.5;
  if(ab<220&&r<.04&&p.attackCooldown<=0){
    p.state='attack';p.movePhase='startup';p.moveTimer=0;
    p.attackDmg=7+r*8|0;p.attackName='AI';
  }
}

// ─── INPUT ─────────────────────────────────────────────────────
function getDir(cfg){
  const f=!!keys[cfg.f],b=!!keys[cfg.b],u=!!keys[cfg.u],d=!!keys[cfg.d];
  if(f&&!b&&!u&&!d)return 'F';
  if(!f&&b&&!u&&!d)return 'B';
  if(!f&&!b&&u&&!d)return 'U';
  if(!f&&!b&&!u&&d)return 'D';
  if(f&&!b&&u&&!d)return 'UF';
  if(!f&&b&&u&&!d)return 'UB';
  if(f&&!b&&!u&&d)return 'DF';
  if(!f&&b&&!u&&d)return 'DB';
  return 'N';
}

function handleFightInput(){
  const p1=f1;const p2=f2;
  // P1
  const d1=getDir(KEYS.p1);p1.inp.add(d1);
  if(keys[KEYS.p1.lp])p1.inp.press('LP');
  if(keys[KEYS.p1.hp])p1.inp.press('HP');
  if(keys[KEYS.p1.lk])p1.inp.press('LK');
  if(keys[KEYS.p1.hk])p1.inp.press('HK');
  if(keys[KEYS.p1.bl])p1.inp.press('BL');
  const l=!!keys[KEYS.p1.b],r=!!keys[KEYS.p1.f],dn=!!keys[KEYS.p1.d];
  
  if(!p1.locked && p1.onGround){
    p1.crouching = dn;
    if(p1.crouching) {
      p1.vx = 0;
    } else {
      if(l&&!r){p1.vx=-p1.speed;p1.facing=false}
      else if(r&&!l){p1.vx=p1.speed;p1.facing=true}
    }
  }
  if(keys[KEYS.p1.u]&&p1.onGround&&!p1.locked&&!p1.crouching){p1.vy=-10;p1.onGround=false}
  p1.startBlock(!!keys[KEYS.p1.bl]);

  if(!p1.locked&&p1.state!=='attack'){
    if(!p1.trySpecial()){
      if(keys[KEYS.p1.lp])p1.doBasic('LP',5);
      else if(keys[KEYS.p1.hp])p1.doBasic('HP',8);
      else if(keys[KEYS.p1.lk])p1.doBasic('LK',6);
      else if(keys[KEYS.p1.hk])p1.doBasic('HK',10);
    }
  }
  p1.inp.clear();

  // P2
  if(mode==='2p'){
    const d2=getDir(KEYS.p2);p2.inp.add(d2);
    if(keys[KEYS.p2.lp])p2.inp.press('LP');
    if(keys[KEYS.p2.hp])p2.inp.press('HP');
    if(keys[KEYS.p2.lk])p2.inp.press('LK');
    if(keys[KEYS.p2.hk])p2.inp.press('HK');
    if(keys[KEYS.p2.bl])p2.inp.press('BL');
    const l2=!!keys[KEYS.p2.b],r2=!!keys[KEYS.p2.f],dn2=!!keys[KEYS.p2.d];
    
    if(!p2.locked && p2.onGround){
      p2.crouching = dn2;
      if(p2.crouching) {
        p2.vx = 0;
      } else {
        if(l2&&!r2){p2.vx=-p2.speed;p2.facing=false}
        else if(r2&&!l2){p2.vx=p2.speed;p2.facing=true}
      }
    }
    if(keys[KEYS.p2.u]&&p2.onGround&&!p2.locked&&!p2.crouching){p2.vy=-10;p2.onGround=false}
    p2.startBlock(!!keys[KEYS.p2.bl]);
    if(!p2.locked&&p2.state!=='attack'){
      if(!p2.trySpecial()){
        if(keys[KEYS.p2.lp])p2.doBasic('LP',5);
        else if(keys[KEYS.p2.hp])p2.doBasic('HP',8);
        else if(keys[KEYS.p2.lk])p2.doBasic('LK',6);
        else if(keys[KEYS.p2.hk])p2.doBasic('HK',10);
      }
    }
    p2.inp.clear();
  }else{
    runAI(p2,p1);
  }
  if(p1.onGround)p1.airMoves=0;
  if(p2.onGround)p2.airMoves=0;
}

// ─── COLLISION ────────────────────────────────────────────────
function rectHit(a,b){
  return a&&b&&a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
}
function checkHits(){
  const b1=f1.getActiveBox();
  if(b1&&!f2.invuln){
    const db={x:f2.left,y:f2.top+(f2.crouching?80:0),w:f2.w,h:f2.h-(f2.crouching?80:0)};
    if(rectHit(b1,db)){
      const block=f2.blocking;
      const d=block?0:(f1.attackDmg||5);
      f2.takeHit(d,block?10:22,(f2.x-f1.x>0?1:-1)*(block?2:6),block);
      if(!block){
        comboCount++;comboOwner=f1;comboTimer=45;
        dmgDisplay.push({x:f2.x,y:f2.y-100,val:'-'+d,life:30,color:'#ff0'});
        spawnP(f2.x,f2.y-100,25,'#800',{spread:1.5,spark:false}); // Blood particles
        spawnP(f2.x,f2.y-100,10,'#f00',{spread:1.2,spark:true}); // Brighter blood
        f1.meter=Math.min(f1.maxMeter,f1.meter+.8);
        hitstop=4;shakeX=(Math.random()-.5)*15;shakeY=(Math.random()-.5)*15;
      }else{hitstop=2;spawnP(f2.x,f2.y-100,4,'#44f',{spread:.6})}
    }
  }
  const b2=f2.getActiveBox();
  if(b2&&!f1.invuln){
    const db={x:f1.left,y:f1.top+(f1.crouching?80:0),w:f1.w,h:f1.h-(f1.crouching?80:0)};
    if(rectHit(b2,db)){
      const block=f1.blocking;
      const d=block?0:(f2.attackDmg||5);
      f1.takeHit(d,block?10:22,(f1.x-f2.x>0?1:-1)*(block?2:6),block);
      if(!block){
        comboCount++;comboOwner=f2;comboTimer=45;
        dmgDisplay.push({x:f1.x,y:f1.y-100,val:'-'+d,life:30,color:'#ff0'});
        spawnP(f1.x,f1.y-100,25,'#800',{spread:1.5,spark:false}); // Blood particles
        spawnP(f1.x,f1.y-100,10,'#f00',{spread:1.2,spark:true}); // Brighter blood
        f2.meter=Math.min(f2.maxMeter,f2.meter+.8);
        hitstop=4;shakeX=(Math.random()-.5)*15;shakeY=(Math.random()-.5)*15;
      }else{hitstop=2;spawnP(f1.x,f1.y-100,4,'#44f',{spread:.6})}
    }
  }
}
function pushApart(){
  const o=24;
  if(f1.right+o>f2.left&&f1.left<f2.right+o){
    const mid=(f1.x+f2.x)/2,d=f1.w+o;
    f1.x=mid-d/2;f2.x=mid+d/2;
    f1.x=clamp(f1.x,WL+f1.w/2,WR-f1.w/2);
    f2.x=clamp(f2.x,WL+f2.w/2,WR-f2.w/2);
  }
}

// ─── RENDER ───────────────────────────────────────────────────
function drawBG(){
  const g=ctx.createLinearGradient(0,0,0,H);
  g.addColorStop(0,'#080202');g.addColorStop(.4,'#160606');
  g.addColorStop(.7,'#200a0a');g.addColorStop(1,'#0d0505');
  ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
  ctx.fillStyle='rgba(255,200,100,.12)';
  ctx.beginPath();ctx.arc(780,90,55,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='rgba(255,200,100,.06)';
  ctx.beginPath();ctx.arc(780,90,85,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='rgba(50,20,20,.3)';
  for(let i=0;i<6;i++){const px=60+i*160;ctx.fillRect(px,100,30,GND-100);ctx.fillRect(px-15,90,60,22)}
  ctx.fillStyle='#1a0d0d';ctx.fillRect(0,GND,W,H-GND);
  ctx.fillStyle='#0d0505';ctx.fillRect(0,GND,W,4);
  ctx.strokeStyle='rgba(60,25,25,.15)';ctx.lineWidth=1;
  for(let i=0;i<24;i++){ctx.beginPath();ctx.moveTo(i*42,GND+8);ctx.lineTo(i*42+20,GND+8);ctx.stroke()}
  ctx.save();ctx.translate(W/2,260);
  ctx.fillStyle='rgba(139,0,0,.06)';
  ctx.font='100px "Passion One",sans-serif';
  ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.fillText('☯',0,0);ctx.restore();
}

function drawSelect(){
  sctx.fillStyle='#080404';sctx.fillRect(0,0,960,420);
  const cols=3,rows=1,cw=180,ch=140,px=20,py=10;
  const sx=(960-cols*(cw+px))/2+cw/2,sy=(420-rows*(ch+py))/2+ch/2;
  sctx.font='13px "Passion One",sans-serif';sctx.textAlign='center';
  for(let i=0;i<CHAR_IDS.length;i++){
    const col=i%cols,row=Math.floor(i/cols);
    const x=sx+col*(cw+px),y=sy+row*(ch+py);
    const cd=CHARS[CHAR_IDS[i]];
    const isP1=selP1===i,isP2=selP2===i;
    let bc=isP1&&isP2?'#f0f':isP1?'#f40':isP2?'#0af':'#333';
    sctx.fillStyle='rgba(15,8,8,.85)';
    sctx.strokeStyle=bc;sctx.lineWidth=isP1||isP2?3:1;
    sctx.beginPath();roundRectPath(sctx,x-cw/2,y-ch/2,cw,ch,6);sctx.closePath();sctx.fill();sctx.stroke();
    sctx.fillStyle=cd.cs.torso;
    sctx.beginPath();sctx.arc(x,y-15,24,0,Math.PI*2);sctx.fill();
    sctx.strokeStyle='rgba(255,255,255,.2)';sctx.lineWidth=1.5;sctx.stroke();
    sctx.fillStyle='#ddd';sctx.font='bold 14px "Passion One",sans-serif';
    sctx.fillText(cd.name.toUpperCase(),x,y+28);
    if(isP1){sctx.fillStyle='#f40';sctx.fillText('◀ P1',x,y+45)}
    if(isP2){sctx.fillStyle='#0af';sctx.fillText('P2 ▶',x,y+45)}
    if(isP1&&isP2){sctx.fillStyle='#f0f';sctx.fillText('★',x,y+45)}
  }
  if(selR1){sctx.fillStyle='#f40';sctx.textAlign='left';sctx.font='bold 14px "Passion One",sans-serif';
    sctx.fillText('✓ P1: '+CHARS[CHAR_IDS[selP1]].name,15,410)}
  if(selR2){sctx.fillStyle='#0af';sctx.textAlign='right';
    const txt='P2: '+CHARS[CHAR_IDS[selP2]].name+(mode==='1p'?' (CPU)':'')+' ✓';
    sctx.fillText(txt,945,410)}
  if(selR1&&selR2&&fightStartTimer>0){
    sctx.fillStyle='#ff0';sctx.textAlign='center';sctx.font='bold 18px "Passion One",sans-serif';
    sctx.fillText('COMENZANDO... '+(Math.ceil(fightStartTimer/30)),480,410);
  }
}

function updateUI(){
  hud.hp[0].style.width=(f1.hp/f1.maxHp*100)+'%';
  hud.hp[1].style.width=(f2.hp/f2.maxHp*100)+'%';
  hud.dmg[0].style.width=(f1.hp/f1.maxHp*100)+'%';
  hud.dmg[1].style.width=(f2.hp/f2.maxHp*100)+'%';
  hud.meter[0].style.width=(f1.meter/f1.maxMeter*100)+'%';
  hud.meter[1].style.width=(f2.meter/f2.maxMeter*100)+'%';
  hud.timer.textContent=Math.ceil(timer);
  if(comboCount>1&&comboTimer>0){
    comboText.textContent=comboCount+' HITS!';comboText.style.opacity=1;
  }else comboText.style.opacity=0;
  for(let i=dmgDisplay.length-1;i>=0;i--){dmgDisplay[i].y-=.8;dmgDisplay[i].life--;if(dmgDisplay[i].life<=0)dmgDisplay.splice(i,1)}
}
function drawNums(){
  for(const d of dmgDisplay){
    ctx.globalAlpha=d.life/30;ctx.fillStyle=d.color;
    ctx.font='bold 20px "Passion One",sans-serif';ctx.textAlign='center';
    ctx.shadowColor='rgba(0,0,0,.8)';ctx.shadowBlur=6;
    ctx.fillText(d.val,d.x,d.y);ctx.shadowBlur=0;
  }ctx.globalAlpha=1;
}
function drawCombo(){
  if(comboCount>1&&comboTimer>0&&comboOwner){
    ctx.fillStyle='#ff0';ctx.font='bold 32px "Passion One",sans-serif';
    ctx.textAlign='center';ctx.shadowColor='rgba(255,100,0,.8)';ctx.shadowBlur=20;
    ctx.fillText(comboCount+' HIT',W/2,65);ctx.shadowBlur=0;
  }
}

function showMsg(t,s){msgTitle.textContent=t;msgSub.textContent=s||'';show(overlay)}
function hideMsg(){hide(overlay)}

// ─── GAME FLOW ────────────────────────────────────────────────
function startFight(){
  // Limpiar teclas para evitar arrastre
  for(const k in keys)keys[k]=false;
  f1=new Fighter(CHAR_IDS[selP1],true);
  f2=new Fighter(CHAR_IDS[selP2],false);
  f1.reset(220,true);f2.reset(740,false);
  hud.name[0].textContent=CHARS[CHAR_IDS[selP1]].name.toUpperCase();
  hud.name[1].textContent=CHARS[CHAR_IDS[selP2]].name.toUpperCase();
  timer=99;particles=[];projectiles=[];dmgDisplay=[];
  comboCount=0;comboOwner=null;comboTimer=0;
  hitstop=0;shakeX=0;shakeY=0;roundOver=false;
  state='countdown';stateTimer=105;
  hideMsg();hide($('select-screen'));
  show($('game-hud'));canvas.classList.add('visible');
  hud.round.textContent='ROUND '+round;
  hud.score.textContent=p1Wins+'-'+p2Wins;
  updateUI();
}

function endRound(winner){
  if(winner===1)p1Wins++;else p2Wins++;
  hud.score.textContent=p1Wins+'-'+p2Wins;
  const n1=CHARS[CHAR_IDS[selP1]].name.toUpperCase();
  const n2=CHARS[CHAR_IDS[selP2]].name.toUpperCase();
  if(p1Wins>=2){state='gameover';showMsg(n1+' GANA','¡'+CHARS[CHAR_IDS[selP1]].name+' es campeón!')}
  else if(p2Wins>=2){state='gameover';showMsg(n2+' GANA','¡'+CHARS[CHAR_IDS[selP2]].name+' es campeón!')}
  else{state='roundend';round++;showMsg(winner===1?n1:n2,'¡Gana la ronda!');setTimeout(startFight,2000)}
  updateUI();
}

function goToMenu(){
  for(const k in keys)keys[k]=false;
  hide(overlay);hide($('game-hud'));canvas.classList.remove('visible');
  hide($('select-screen'));hide($('controls-screen'));show($('menu-screen'));
  state='menu';p1Wins=0;p2Wins=0;round=1;
}

function goToSelect(){
  selP1=0;selP2=1;selR1=false;selR2=false;selCD1=0;selCD2=0;
  hide($('menu-screen'));hide($('controls-screen'));show($('select-screen'));
  state='select';drawSelect();
}

// ─── MENU / SELECT LOGIC ──────────────────────────────────────
function handleMenu(){
  const items=document.querySelectorAll('#menu-options .menu-item');
  if((keys['ArrowUp']||keys['w'])&&!menuCD){menuSel=(menuSel-1+4)%4;menuCD=10}
  if((keys['ArrowDown']||keys['s'])&&!menuCD){menuSel=(menuSel+1)%4;menuCD=10}
  if(menuCD>0)menuCD--;
  items.forEach((e,i)=>e.classList.toggle('selected',i===menuSel));
  if(keys['Enter']||keys[' ']){
    if(menuSel===0){keys['Enter']=false;keys[' ']=false;mode='1p';isMultiplayer=false;goToSelect()}
    else if(menuSel===1){keys['Enter']=false;keys[' ']=false;mode='2p';isMultiplayer=false;goToSelect()}
    else if(menuSel===2){
      keys['Enter']=false;keys[' ']=false;
      mode='multi';isMultiplayer=true;
      show($('matchmaking-screen'));
      hide($('menu-screen'));
      connectMultiplayer();
    }
    else if(menuSel===3){keys['Enter']=false;keys[' ']=false;
      hide($('menu-screen'));show($('controls-screen'));state='controls'}
  }
}

function connectMultiplayer(){
  if(typeof io === 'undefined'){
    alert("Socket.io no cargado o el servidor local no está corriendo.");
    hide($('matchmaking-screen'));show($('menu-screen'));
    return;
  }
  if(!socket) {
    socket = io();
    socket.on('match_found', (data) => {
      myRole = data.role;
      hide($('matchmaking-screen'));
      selP1 = 0; selP2 = 1; // Default characters for fast matchmaking
      selR1 = true; selR2 = true;
      p1Wins = 0; p2Wins = 0; round = 1;
      startFight();
    });
    socket.on('game_input', (data) => {
      keys[data.key] = data.state;
    });
    socket.on('opponent_disconnected', () => {
      alert("El oponente se ha desconectado.");
      goToMenu();
    });
  }
  socket.emit('join_matchmaking');
}

$('cancel-match-btn').onclick = () => {
  if(socket){socket.disconnect();socket=null;}
  hide($('matchmaking-screen')); show($('menu-screen'));
};

function handleControls(){
  if(keys['Enter']||keys[' ']||keys['Escape']){
    keys['Enter']=false;keys[' ']=false;keys['Escape']=false;
    show($('menu-screen'));hide($('controls-screen'));state='menu';
  }
}

function handleSelect(){
  const total=CHAR_IDS.length;
  // P1: WASD + J to confirm
  if((keys['a']||keys['A'])&&!selCD1){selP1=(selP1-1+total)%total;selCD1=10;selR1=false}
  if((keys['d']||keys['D'])&&!selCD1){selP1=(selP1+1)%total;selCD1=10;selR1=false}
  if((keys['w']||keys['W'])&&!selCD1){selP1=(selP1-3+total)%total;selCD1=10;selR1=false}
  if((keys['s']||keys['S'])&&!selCD1){selP1=(selP1+3)%total;selCD1=10;selR1=false}
  if((keys['j']||keys['J'])&&!selR1){keys['j']=false;keys['J']=false;selR1=true}

  // P2: Arrows + Enter/1 to confirm
  if(mode==='2p'){
    if((keys['ArrowLeft'])&&!selCD2){selP2=(selP2-1+total)%total;selCD2=10;selR2=false}
    if((keys['ArrowRight'])&&!selCD2){selP2=(selP2+1)%total;selCD2=10;selR2=false}
    if((keys['ArrowUp'])&&!selCD2){selP2=(selP2-3+total)%total;selCD2=10;selR2=false}
    if((keys['ArrowDown'])&&!selCD2){selP2=(selP2+3)%total;selCD2=10;selR2=false}
    if((keys['1'])&&!selR2){keys['1']=false;selR2=true}
    // Enter también confirma P2
    if((keys['Enter'])&&!selR2&&selR1){keys['Enter']=false;selR2=true}
  }else{
    if(selR1&&!selR2){
      const avail=[];for(let i=0;i<total;i++)if(i!==selP1)avail.push(i);
      selP2=avail[Math.random()*avail.length|0];selR2=true;
    }
  }
  if(selCD1>0)selCD1--;if(selCD2>0)selCD2--;

  // Ensure P1 and P2 don't select same
  if(selR1&&selR2&&selP1===selP2){
    if(mode==='2p'){selR2=false;selP2=(selP2+1)%total}
    else{selP2=(selP2+1)%total}
  }

  $('p1-char-name').textContent=selR1?CHARS[CHAR_IDS[selP1]].name.toUpperCase():'???';
  $('p2-char-name').textContent=selR2?CHARS[CHAR_IDS[selP2]].name.toUpperCase()+(mode==='1p'?' (CPU)':''):'???';

  // Start fight when both ready
  if(selR1&&selR2){
    if(!fightStartTimer)fightStartTimer=30; // ~0.5s delay
    fightStartTimer--;
    if(fightStartTimer<=0||keys['Enter']||keys[' ']){
      keys['Enter']=false;keys[' ']=false;
      p1Wins=0;p2Wins=0;round=1;
      startFight();
    }
  }else fightStartTimer=0;
  drawSelect();
}

// ─── GAME LOOP ────────────────────────────────────────────────
function gameLoop(){
  if(state==='menu')handleMenu();
  else if(state==='controls')handleControls();
  else if(state==='select')handleSelect();
  else if(state==='countdown'){
    f1.update();f2.update();pushApart();updProj();updP();
    stateTimer--;if(stateTimer<=0)state='fighting';
  }else if(state==='fighting'){
    if(hitstop>0)hitstop--;
    else{handleFightInput();f1.update();f2.update();pushApart();checkHits();
      updProj();updP();timer-=1/60;if(timer<0)timer=0;updateUI();
      if(comboTimer>0)comboTimer--;else{comboCount=0;comboOwner=null}
      if(f1.hp<=0&&!roundOver){
        if(p2Wins===1){state='finish_him';stateTimer=180;showMsg('FINISH HIM','');f1.hp=0;}
        else{roundOver=true;spawnP(f1.x,f1.y-100,40,'#800',{spread:2});endRound(2);}
      }
      else if(f2.hp<=0&&!roundOver){
        if(p1Wins===1){state='finish_him';stateTimer=180;showMsg('FINISH HIM','');f2.hp=0;}
        else{roundOver=true;spawnP(f2.x,f2.y-100,40,'#800',{spread:2});endRound(1);}
      }
      else if(timer<=0&&!roundOver){roundOver=true;
        if(f1.hp>f2.hp)endRound(1);else if(f2.hp>f1.hp)endRound(2);
        else endRound(0);
      }
    }
  }else if(state==='finish_him'){
    if(hitstop>0)hitstop--;
    else {
      handleFightInput();f1.update();f2.update();pushApart();updProj();updP();
      const w=f1.hp<=0?f2:f1;const l=f1.hp<=0?f1:f2;
      l.state='hitstun';l.hitstun=10;l.vy=0;l.vx=0;
      stateTimer--;
      if(stateTimer<=0){roundOver=true;endRound(w===f1?1:2);}
      if(w.state==='attack' && w.attackDmg>=50){
        w.state='idle'; w.movePhase='none'; state='fatality'; stateTimer=180;
        document.body.style.backgroundColor='#200';
        l.sprite.play('dead'); w.sprite.play('attack2');
        spawnP(l.x,l.y-100,200,'#a00',{spread:6,spark:false});
        spawnP(l.x,l.y-50,100,'#f00',{spread:4,spark:true});
        shakeX=25;shakeY=25;hitstop=10;
        msgTitle.textContent="FATALITY";msgTitle.style.color="#f00";msgTitle.style.fontSize="100px";
        msgSub.textContent=w.name.toUpperCase()+" WINS";
        show(overlay);hide($('restart-btn'));hide($('menu-btn'));
      }
    }
  }else if(state==='fatality'){
    if(hitstop>0)hitstop--;
    updP();
    stateTimer--;
    if(stateTimer<=0){
      document.body.style.backgroundColor='';
      msgTitle.style.fontSize="";msgTitle.style.color="";
      show($('restart-btn'));show($('menu-btn'));
      roundOver=true;endRound(f1.hp<=0?2:1);
    }
  }

  // Render fight
  if(state==='fighting'||state==='countdown'||state==='roundend'||state==='gameover'||state==='finish_him'||state==='fatality'){
    shakeX*=.8;shakeY*=.8;
    ctx.save();ctx.translate(shakeX,shakeY);
    ctx.clearRect(-5,-5,W+10,H+10);drawBG();
    if(f1.x<f2.x){f1.draw(ctx);f2.draw(ctx)}else{f2.draw(ctx);f1.draw(ctx)}
    drawProj();drawP();drawNums();drawCombo();
    if(state==='countdown'){
      const sec=Math.ceil(stateTimer/26);
      const txt=['FIGHT!','1','2','3'][Math.min(3,sec)];
      ctx.fillStyle=txt==='FIGHT!'?'#f40':'#fc0';
      ctx.font='110px "Passion One",sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
      ctx.shadowColor='rgba(255,0,0,.7)';ctx.shadowBlur=50;
      ctx.fillText(txt,W/2,H/2-20);ctx.shadowBlur=0;
    }
    ctx.restore();
  }
  requestAnimationFrame(gameLoop);
}

// ─── EVENTS ───────────────────────────────────────────────────
window.addEventListener('keydown',e=>{
  if (isMultiplayer) {
    const isP1Key = Object.values(KEYS.p1).includes(e.key) || Object.values(KEYS.p1).includes(e.key.toLowerCase());
    const isP2Key = Object.values(KEYS.p2).includes(e.key);
    if ((myRole === 'p1' && isP1Key) || (myRole === 'p2' && isP2Key)) {
      keys[e.key] = true;
      if(socket) socket.emit('game_input', {key: e.key, state: true});
    }
  } else {
    keys[e.key]=true;
  }
  if(e.code){
    if(e.code.startsWith('Digit'))keys[e.code.replace('Digit','')]=true;
    if(e.code.startsWith('Numpad'))keys[e.code.replace('Numpad','')]=true;
  }
  e.preventDefault();
});
window.addEventListener('keyup',e=>{
  if (isMultiplayer) {
    const isP1Key = Object.values(KEYS.p1).includes(e.key) || Object.values(KEYS.p1).includes(e.key.toLowerCase());
    const isP2Key = Object.values(KEYS.p2).includes(e.key);
    if ((myRole === 'p1' && isP1Key) || (myRole === 'p2' && isP2Key)) {
      keys[e.key] = false;
      if(socket) socket.emit('game_input', {key: e.key, state: false});
    }
  } else {
    keys[e.key]=false;
  }
  if(e.code){
    if(e.code.startsWith('Digit'))keys[e.code.replace('Digit','')]=false;
    if(e.code.startsWith('Numpad'))keys[e.code.replace('Numpad','')]=false;
  }
  e.preventDefault();
});
rstBtn.addEventListener('click',()=>{
  if(state==='gameover'){p1Wins=0;p2Wins=0;round=1;startFight()}
});
menuBtn.addEventListener('click',goToMenu);
$('controls-back')?.addEventListener('click',()=>{
  if(state==='controls'){show($('menu-screen'));hide($('controls-screen'));state='menu'}
});

// ─── START ────────────────────────────────────────────────────
show($('menu-screen'));
loadSprites(()=>{
  const lt=$('loading-text');
  if(lt){lt.textContent='Sprites listos';lt.classList.add('done')}
});
gameLoop();
