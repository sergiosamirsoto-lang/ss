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
let opponentName = '';
let remoteKeys = {}; // Teclas del rival en multijugador (llegan por WebSocket)
let multiplayerSyncFrame = 0;

const FIGHTER_SYNC_FIELDS = ['facing','x','y','vx','vy','onGround','hp','meter','state','moveTimer','movePhase','blocking','crouching','hitstun','canCancel','invuln','airMoves','breath','comboCount','comboTimer','chargeDir','chargeTimer','attackDmg','attackName','attackCooldown','blocksRemaining','knockedTimer','knockInvuln'];

function fighterSnapshot(f) {
  return FIGHTER_SYNC_FIELDS.reduce((snapshot, key) => (snapshot[key] = f[key], snapshot), {});
}

function applyFighterSnapshot(f, snapshot) {
  if (!f || !snapshot) return;
  FIGHTER_SYNC_FIELDS.forEach(key => {
    if (Object.prototype.hasOwnProperty.call(snapshot, key)) f[key] = snapshot[key];
  });
  f.sprite.play(f.getAnimState());
  f.sprite.update(1);
}

function emitMultiplayerState() {
  if (mode !== 'multi' || myRole !== 'p1' || !socket || !f1 || !f2) return;
  // 20 snapshots/second keeps remote play responsive without flooding the server.
  if (++multiplayerSyncFrame % 3) return;
  socket.emit('game_state', { f1: fighterSnapshot(f1), f2: fighterSnapshot(f2), state, stateTimer, timer, round, p1Wins, p2Wins, roundOver,
    message: { visible: !overlay.classList.contains('hidden'), title: msgTitle.textContent, subtitle: msgSub.textContent } });
}
// Sound System
const SND = {
  ctx: null, init(){try{this.ctx=new(window.AudioContext||window.webkitAudioContext)()}catch(e){}},
  _osc(type,freq,endFreq,dur,vol){
    if(!this.ctx)return;const o=this.ctx.createOscillator(),g=this.ctx.createGain();
    o.type=type;o.connect(g);g.connect(this.ctx.destination);const t=this.ctx.currentTime;
    o.frequency.setValueAtTime(freq,t);if(endFreq)o.frequency.exponentialRampToValueAtTime(endFreq,t+dur);
    g.gain.setValueAtTime(vol,t);g.gain.exponentialRampToValueAtTime(.001,t+dur);
    o.start(t);o.stop(t+dur);
  },
  _noise(dur,vol){if(!this.ctx)return;const b=this.ctx.createBuffer(1,this.ctx.sampleRate*dur|0,this.ctx.sampleRate),d=b.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;const s=this.ctx.createBufferSource(),g=this.ctx.createGain();s.buffer=b;s.connect(g);g.connect(this.ctx.destination);const t=this.ctx.currentTime;g.gain.setValueAtTime(vol,t);g.gain.exponentialRampToValueAtTime(.001,t+dur);s.start(t);
  },
  hit(){this._noise(.08,.25);this._osc('sawtooth',200,80,.08,.15)},
  block(){this._noise(.04,.12);this._osc('square',150,120,.04,.1)},
  kill(){this._noise(.2,.4);this._osc('sawtooth',400,30,.3,.3)},
  special(){this._osc('sine',600,1200,.15,.2);this._osc('square',300,600,.15,.1)},
  fatality(){this._noise(.5,.5);this._osc('sawtooth',200,20,.8,.3);this._osc('sine',800,100,.8,.2)},
  round(){this._osc('sine',440,440,.15,.2);setTimeout(()=>this._osc('sine',660,660,.15,.2),200);setTimeout(()=>this._osc('sine',880,880,.25,.25),400)},
  fight(){this._osc('sawtooth',220,440,.3,.3)},
  select(){this._osc('sine',600,800,.1,.1)},
  win(){this._osc('sine',523,523,.1,.15);setTimeout(()=>this._osc('sine',659,659,.1,.15),120);setTimeout(()=>this._osc('sine',784,784,.1,.15),240);setTimeout(()=>this._osc('sine',1047,1047,.3,.25),360)},
};
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
const SPRITE_OFFSETS={samurai:{x:0,y:0},archer:{x:0,y:0},commander:{x:0,y:0}};

let spritesLoaded=false;
// Fondo personalizado
const bgImg = new Image();
bgImg.src = 'Fondo.png';

function loadSprites(callback){
  if(typeof console==='undefined'||!SPR_TYPES)return;
  console.log('Loading sprites...');
  const total=SPR_TYPES.length;
  let loaded=0;
  for(const type of SPR_TYPES){
    if(!SPR[type])SPR[type]={};
    const folder=SPR_FOLDERS[type];
    const anims=SPR_ANIM[type];
    const names=new Set();
    if(!anims)continue;
    for(const key in anims)names.add(anims[key].fileName);
    let typeLoaded=0;
    const typeTotal=names.size;
    if(typeTotal===0)continue;
    console.log('Type '+type+': '+typeTotal+' images');
    for(const fn of names){
      const img=new Image();
      img.onload=function(){typeLoaded++;if(typeLoaded>=typeTotal){loaded++;if(loaded>=total){spritesLoaded=true;console.log('All sprites loaded');if(callback)callback()}}};
      img.onerror=function(){console.warn('Failed to load: '+folder+'/'+fn+'.png');typeLoaded++;if(typeLoaded>=typeTotal){loaded++;if(loaded>=total){spritesLoaded=true;console.log('All sprites loaded (with errors)');if(callback)callback()}}};
      img.src='personajes/'+folder+'/'+fn+'.png';
      SPR[type][fn]=img;
    }
  }
}

// ─── FRAME WIDTH CACHE ────────────────────────────────────────
const SPR_FW={}; // SPR_FW[spriteType][fileName] = frameWidth
function getFrameW(type,fileName,frames){
  const t=SPR_FW[type]||(SPR_FW[type]={});
  if(t[fileName]!==undefined)return t[fileName];
  const img=SPR[type]&&SPR[type][fileName];
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
    const anim=SPR_ANIM[this.type]&&SPR_ANIM[this.type][this.state];
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
      {inp:['U','U','HP'],name:'La Cayetana',dmg:50,desc:'U,U+HP (Fatality)', fatality: true},
    ]},
  pijudo:{name:'El Pijudo',cs:{torso:'#8b0000',pants:'#3a0000',belt:'#888',skin:'#e8c090',boot:'#223344',gloves:'#4a0000',hair:'#445',headband:false},
    moves:[
      {inp:['D','F','LP'],name:'El Frío',dmg:10,desc:'D,F+LP'},
      {inp:['D','B','LK'],name:'Agarrón',dmg:8,desc:'D,B+LK'},
      {inp:['B','LK','HK'],name:'Pase Shuco',dmg:9,desc:'B+LK+HK'},
      {inp:['F','F','D','HK'],name:'Golpe Chafa',dmg:14,desc:'F,F,D+HK'},
      {inp:['F','F','HP'],name:'El Descuartizador',dmg:50,desc:'F,F+HP (Fatality)', fatality: true},
    ]},
  maje:{name:'El Maje',cs:{torso:'#884400',pants:'#442200',belt:'#ff0',skin:'#d4a574',boot:'#221100',gloves:'#884400',hair:'#fff',headband:false},
    moves:[
      {inp:['B','B','F'],name:'El Macanazo',dmg:11,desc:'B,B,F'},
      {inp:['D','F','LP'],name:'Rayo',dmg:9,desc:'D,F+LP'},
      {inp:['D','U'],name:'El Brinco',dmg:0,desc:'D+U'},
      {inp:['D','D','HK'],name:'La Rompe Madres',dmg:50,desc:'D,D+HK (Fatality)', fatality: true},
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
    this.knockedTimer=0;
    this.knockInvuln=0;
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
    this.knockedTimer=0;
    this.knockInvuln=0;
    this.sprite=new SpriteAnim(this.spriteType);
  }
  get left(){return this.x-this.w/2}
  get right(){return this.x+this.w/2}
  get top(){return this.y-this.h}
  get locked(){return this.state==='hitstun'||this.state==='blockstun'||this.state==='knocked'}

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

  doEx(btn){
    if(this.meter<this.maxMeter)return false;
    if(this.locked||this.invuln>0||!this.onGround)return false;
    if(this.state==='attack')return false;
    this.meter=0;this.state='attack';this.movePhase='startup';
    this.moveTimer=0;this.attackDmg=btn==='HP'||btn==='HK'?25:20;
    this.attackName='EX_'+btn;this.canCancel=false;
    SND.special();hitstop=8;shakeX=(Math.random()-.5)*20;shakeY=(Math.random()-.5)*15;
    spawnP(this.x,this.y-100,30,'#ff0',{spread:2,spark:true});
    spawnP(this.x,this.y-100,20,'#fff',{spread:1.5,spark:false});
    return true;
  }

  trySpecial(){
    if(this.locked||this.invuln>0||this.attackCooldown>0)return false;
    const cd=CHARS[this.id];
    if(!cd||!cd.moves)return false;
    for(const m of cd.moves){
      if(m.fatality && state !== 'finish_him') continue;
      if(this.inp.match(m.inp)){
        this.state='attack';this.movePhase='startup';
        this.moveTimer=0;this.attackDmg=m.dmg;
        this.attackName=m.name;this.canCancel=false;
        this.move=m;
        if(!m.fatality)SND.special();
        return true;
      }
    }
    return false;
  }

  takeHit(dmg,stun,knock,blocked){
    if(this.invuln>0||this.knockInvuln>0)return;
    this.invuln=12;
    if(blocked){
      this.blocksRemaining--;
      if(this.blocksRemaining<0){
        this.blocking=false;
        this.state='hitstun';this.hitstun=30;
        this.vx=(this.facing?1:-1)*10;this.vy=-6;
        spawnP(this.x,this.y-100,30,'#44f',{spread:1.5,spark:true});
        hitstop=8;shakeX=(Math.random()-.5)*20;shakeY=(Math.random()-.5)*15;
        SND.kill();
      }else{
        this.hp=Math.max(0,this.hp-0);
        this.state='blockstun';this.hitstun=stun;
        this.vx=knock*.3;
        this.meter=Math.min(this.maxMeter,this.meter+.5);
        SND.block();
        return;
      }
    }
    this.hp=Math.max(0,this.hp-dmg);
    if(Math.abs(knock)>8&&this.onGround){
      this.state='knocked';this.knockedTimer=45;
      this.vx=knock;this.vy=-8;this.onGround=false;
      this.meter=Math.min(this.maxMeter,this.meter+1.5);
      SND.kill();
    }else{
      this.state='hitstun';this.hitstun=stun;
      this.vx=knock;this.vy=-3;
      this.meter=Math.min(this.maxMeter,this.meter+1);
      SND.hit();
    }
  }

  getAnimState(){
    if(this.state==='knocked')return this.hp<=0?'dead':'hurt';
    if(this.state==='hitstun')return this.hp<=0?'dead':'hurt';
    if(this.state==='blockstun')return 'block';
    if(this.state==='attack'){
      if(this.attackName==='LP'||this.attackName==='EX_LP')return 'attack1';
      if(this.attackName==='HP'||this.attackName==='EX_HP')return 'attack2';
      if(this.attackName==='LK'||this.attackName==='EX_LK')return 'attack3';
      if(this.attackName==='HK'||this.attackName==='EX_HK')return 'attack3';
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

  update(){
    this.breath+=.03;
    if(this.invuln>0)this.invuln--;
    if(this.attackCooldown>0)this.attackCooldown--;
    if(this.knockInvuln>0)this.knockInvuln--;
    if(this.state==='idle')this.blocksRemaining=2;

    if(!this.onGround){this.vy+=GRAV;this.y+=this.vy}
    else {
      this.y=GND;
      this.vx*=.85;
    }
    
    if(this.y>=GND){this.y=GND;this.vy=0;this.onGround=true}
    this.x+=this.vx;
    this.x=clamp(this.x,WL+this.w/2,WR-this.w/2);
    if(Math.abs(this.vx)<.3)this.vx=0;

    if(this.state==='knocked'){
      if(this.onGround)this.knockedTimer--;
      if(this.knockedTimer<=0&&this.onGround){this.state='idle';this.knockInvuln=30;}
    }else if(this.state==='hitstun'||this.state==='blockstun'){
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

    const animData=SPR_ANIM[this.spriteType]&&SPR_ANIM[this.spriteType][this.sprite.state];
    let drawn = false;
    if(animData){
      const img=SPR[this.spriteType]&&SPR[this.spriteType][animData.fileName];
      if(img&&img.complete&&img.naturalWidth>0){
        const fw=getFrameW(this.spriteType,animData.fileName,animData.frames);
        const fr=this.sprite.frame<animData.frames?this.sprite.frame:0;
        ctx.translate(0,-320);
        if(f<0) ctx.scale(-1,1);
        if(flash) {
          ctx.globalCompositeOperation = 'source-over';
          ctx.globalAlpha = 0.5;
        }
        const off=SPRITE_OFFSETS[this.spriteType]||{x:0,y:0};
        ctx.drawImage(img,fr*fw|0,0,fw,FH,-160+off.x,off.y,320,320);
        ctx.globalAlpha = 1.0;
        drawn = true;
      }
    }
    
    // Fallback if image failed to load or the user doesn't have the assets downloaded
    if(!drawn){
      ctx.fillStyle = this.cs.torso || '#f00';
      ctx.fillRect(-40, -160, 80, 160);
      ctx.fillStyle = '#fff';
      ctx.fillRect(f*20, -140, 10, 10); // Eye to show direction
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
      vx:Math.cos(a)*spd*(opts&&opts.spread||1),
      vy:Math.sin(a)*spd*(opts&&opts.spread||1)-2,
      life:rand(15,40),maxLife:40,size:rand(2,6),
      gravity:opts&&opts.gravity!=null?opts.gravity:.3,
      shrink:opts&&opts.shrink!=null?opts.shrink:true,
      spark:opts&&opts.spark!=null?opts.spark:false});
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
  projectiles.push({x:f.x+d*60,y:f.y-140,vx:d*9,vy:0,w:24,h:8,life:60,owner:f,hit:false,dmg:f.meter>=f.maxMeter?20:10,
    spriteType:f.spriteType});
  if(f.meter>=f.maxMeter){f.meter=0;SND.special();spawnP(f.x+f.x,0,20,'#ff0',{spread:2,spark:true})}
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
let comboScale=[1,.8,.65,.5,.4,.35,.3,.25,.2,.15];
let mode='1p',keys={},dmgDisplay=[];
let selP1=0,selP2=1,selR1=false,selR2=false;
let menuSel=0,menuCD=0;
let selCD1=0,selCD2=0,fightStartTimer=0;

// ─── AI ────────────────────────────────────────────────────────
function runAI(p,o){
  if(p.locked||p.state==='attack'||p.knockInvuln>0)return;
  p.crouching=false;
  const d=o.x-p.x,ab=Math.abs(d),dir=d>0?1:-1,r=Math.random();
  if(p.onGround){
    if(o.state==='knocked'){p.vx=dir*p.speed*1.5;p.facing=dir>0;return}
    if(ab>200){p.vx=dir*p.speed;p.facing=dir>0}
    else if(ab<100&&p.comboCount<2&&r<.3){p.vx=-dir*2.5;p.facing=-dir>0}
    else if(ab<60) p.vx=0
    else p.vx*=.8;
    if(Math.abs(p.vx)<.3)p.vx=0;
    if(ab>200&&r<.05){p.vy=-16;p.onGround=false}
  }
  p.blocking=(ab<140&&o.state==='attack'&&r<.6)||(o.comboCount>=2&&r<.7);
  if(!p.onGround)return;
  if(ab<250&&o.attackCooldown>0&&p.attackCooldown<=0){p.state='attack';p.movePhase='startup';p.moveTimer=0;p.attackDmg=10;p.attackName='AI';return}
  if(ab<160&&r<.06&&p.attackCooldown<=0){
    p.state='attack';p.movePhase='startup';p.moveTimer=0;
    p.attackDmg=7+r*8|0;p.attackName='AI';
  }
}

// ─── INPUT ─────────────────────────────────────────────────────
// keyMap opcional: si se pasa, lee de ese objeto en vez de `keys`
function getDir(cfg, keyMap){
  const km = keyMap || keys;
  const f=!!km[cfg.f],b=!!km[cfg.b],u=!!km[cfg.u],d=!!km[cfg.d];
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

  if(mode==='multi'){
    // MULTIJUGADOR: cada cliente controla solo su personaje
    // El rival se mueve con remoteKeys (llegan del servidor por WebSocket)
    const myK  = myRole==='p1' ? KEYS.p1 : KEYS.p2;
    const oppK = myRole==='p1' ? KEYS.p2 : KEYS.p1;
    const myF  = myRole==='p1' ? p1 : p2;
    const oppF = myRole==='p1' ? p2 : p1;

    // -- Mi personaje (teclas locales) --
    const dm=getDir(myK); myF.inp.add(dm);
    if(keys[myK.lp])myF.inp.press('LP');
    if(keys[myK.hp])myF.inp.press('HP');
    if(keys[myK.lk])myF.inp.press('LK');
    if(keys[myK.hk])myF.inp.press('HK');
    if(keys[myK.bl])myF.inp.press('BL');
    const lm=!!keys[myK.b],rm=!!keys[myK.f],dnm=!!keys[myK.d];
    myF.startBlock(!!keys[myK.bl]);
    if(!myF.locked&&myF.onGround){
      myF.crouching=dnm&&!myF.blocking;
      if(myF.blocking||myF.crouching){myF.vx=0;}
      else if(myF.state!=='attack'){
        if(lm&&!rm){myF.vx=-myF.speed;myF.facing=false}
        else if(rm&&!lm){myF.vx=myF.speed;myF.facing=true}
        else myF.vx=0;
      }
    }
    if(keys[myK.u]&&myF.onGround&&!myF.locked&&!myF.crouching&&!myF.blocking){myF.vy=-16;myF.onGround=false}
    if(!myF.locked&&myF.state!=='attack'){
      if(!myF.trySpecial()){
        if(keys[myK.bl]){if(keys[myK.hp])myF.doEx('HP');else if(keys[myK.hk])myF.doEx('HK');else if(keys[myK.lp])myF.doEx('LP');else if(keys[myK.lk])myF.doEx('LK')}
        else if(keys[myK.lp])myF.doBasic('LP',5);
        else if(keys[myK.hp])myF.doBasic('HP',8);
        else if(keys[myK.lk])myF.doBasic('LK',6);
        else if(keys[myK.hk])myF.doBasic('HK',10);
      }
    }
    myF.inp.clear();

    // -- Rival (remoteKeys = teclas del otro jugador via servidor) --
    const rk=remoteKeys;
    const dOpp=getDir(oppK,rk); oppF.inp.add(dOpp);
    if(rk[oppK.lp])oppF.inp.press('LP');
    if(rk[oppK.hp])oppF.inp.press('HP');
    if(rk[oppK.lk])oppF.inp.press('LK');
    if(rk[oppK.hk])oppF.inp.press('HK');
    if(rk[oppK.bl])oppF.inp.press('BL');
    const lo=!!rk[oppK.b],ro=!!rk[oppK.f],dno=!!rk[oppK.d];
    oppF.startBlock(!!rk[oppK.bl]);
    if(!oppF.locked&&oppF.onGround){
      oppF.crouching=dno&&!oppF.blocking;
      if(oppF.blocking||oppF.crouching){oppF.vx=0;}
      else if(oppF.state!=='attack'){
        if(lo&&!ro){oppF.vx=-oppF.speed;oppF.facing=false}
        else if(ro&&!lo){oppF.vx=oppF.speed;oppF.facing=true}
        else oppF.vx=0;
      }
    }
    if(rk[oppK.u]&&oppF.onGround&&!oppF.locked&&!oppF.crouching&&!oppF.blocking){oppF.vy=-16;oppF.onGround=false}
    if(!oppF.locked&&oppF.state!=='attack'){
      if(!oppF.trySpecial()){
        if(rk[oppK.bl]){if(rk[oppK.hp])oppF.doEx('HP');else if(rk[oppK.hk])oppF.doEx('HK');else if(rk[oppK.lp])oppF.doEx('LP');else if(rk[oppK.lk])oppF.doEx('LK')}
        else if(rk[oppK.lp])oppF.doBasic('LP',5);
        else if(rk[oppK.hp])oppF.doBasic('HP',8);
        else if(rk[oppK.lk])oppF.doBasic('LK',6);
        else if(rk[oppK.hk])oppF.doBasic('HK',10);
      }
    }
    oppF.inp.clear();

  } else {
    // MODO LOCAL (1P o 2P)
    const d1=getDir(KEYS.p1);p1.inp.add(d1);
    if(keys[KEYS.p1.lp])p1.inp.press('LP');
    if(keys[KEYS.p1.hp])p1.inp.press('HP');
    if(keys[KEYS.p1.lk])p1.inp.press('LK');
    if(keys[KEYS.p1.hk])p1.inp.press('HK');
    if(keys[KEYS.p1.bl])p1.inp.press('BL');
    const l=!!keys[KEYS.p1.b],r=!!keys[KEYS.p1.f],dn=!!keys[KEYS.p1.d];
    p1.startBlock(!!keys[KEYS.p1.bl]);
    if(!p1.locked&&p1.onGround){
      p1.crouching=dn&&!p1.blocking;
      if(p1.blocking||p1.crouching){p1.vx=0;}
      else if(p1.state!=='attack'){
        if(l&&!r){p1.vx=-p1.speed;p1.facing=false}
        else if(r&&!l){p1.vx=p1.speed;p1.facing=true}
        else p1.vx=0;
      }
    }
    if(keys[KEYS.p1.u]&&p1.onGround&&!p1.locked&&!p1.crouching&&!p1.blocking){p1.vy=-16;p1.onGround=false}
    if(!p1.locked&&p1.state!=='attack'){
      if(!p1.trySpecial()){
        if(keys[KEYS.p1.bl]){if(keys[KEYS.p1.hp])p1.doEx('HP');else if(keys[KEYS.p1.hk])p1.doEx('HK');else if(keys[KEYS.p1.lp])p1.doEx('LP');else if(keys[KEYS.p1.lk])p1.doEx('LK')}
        else if(keys[KEYS.p1.lp])p1.doBasic('LP',5);
        else if(keys[KEYS.p1.hp])p1.doBasic('HP',8);
        else if(keys[KEYS.p1.lk])p1.doBasic('LK',6);
        else if(keys[KEYS.p1.hk])p1.doBasic('HK',10);
      }
    }
    p1.inp.clear();

    if(mode==='2p'){
      const d2=getDir(KEYS.p2);p2.inp.add(d2);
      if(keys[KEYS.p2.lp])p2.inp.press('LP');
      if(keys[KEYS.p2.hp])p2.inp.press('HP');
      if(keys[KEYS.p2.lk])p2.inp.press('LK');
      if(keys[KEYS.p2.hk])p2.inp.press('HK');
      if(keys[KEYS.p2.bl])p2.inp.press('BL');
      const l2=!!keys[KEYS.p2.b],r2=!!keys[KEYS.p2.f],dn2=!!keys[KEYS.p2.d];
      p2.startBlock(!!keys[KEYS.p2.bl]);
      if(!p2.locked&&p2.onGround){
        p2.crouching=dn2&&!p2.blocking;
        if(p2.blocking||p2.crouching){p2.vx=0;}
        else if(p2.state!=='attack'){
          if(l2&&!r2){p2.vx=-p2.speed;p2.facing=false}
          else if(r2&&!l2){p2.vx=p2.speed;p2.facing=true}
          else p2.vx=0;
        }
      }
      if(keys[KEYS.p2.u]&&p2.onGround&&!p2.locked&&!p2.crouching&&!p2.blocking){p2.vy=-16;p2.onGround=false}
      if(!p2.locked&&p2.state!=='attack'){
        if(!p2.trySpecial()){
          if(keys[KEYS.p2.bl]){if(keys[KEYS.p2.hp])p2.doEx('HP');else if(keys[KEYS.p2.hk])p2.doEx('HK');else if(keys[KEYS.p2.lp])p2.doEx('LP');else if(keys[KEYS.p2.lk])p2.doEx('LK')}
          else if(keys[KEYS.p2.lp])p2.doBasic('LP',5);
          else if(keys[KEYS.p2.hp])p2.doBasic('HP',8);
          else if(keys[KEYS.p2.lk])p2.doBasic('LK',6);
          else if(keys[KEYS.p2.hk])p2.doBasic('HK',10);
        }
      }
      p2.inp.clear();
    } else {
      runAI(p2,p1);
    }
  }

  if(p1.onGround)p1.airMoves=0;
  if(p2.onGround)p2.airMoves=0;
}

// ─── COLLISION ────────────────────────────────────────────────
function rectHit(a,b){
  return a&&b&&a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
}
function getComboScale(){return comboScale[Math.min(comboCount,comboScale.length-1)]}

function checkHits(){
  const b1=f1.getActiveBox();
  if(b1&&!f2.invuln&&!f2.knockInvuln){
    const db={x:f2.left,y:f2.top+(f2.crouching?80:0),w:f2.w,h:f2.h-(f2.crouching?80:0)};
    if(rectHit(b1,db)){
      const block=f2.blocking;
      let raw=(f1.attackDmg||5);
      const scaled=Math.round(raw*getComboScale());
      f2.takeHit(scaled,block?10:22,(f2.x-f1.x>0?1:-1)*(block?2:8),block);
      if(!block){
        comboCount++;comboOwner=f1;comboTimer=45;
        dmgDisplay.push({x:f2.x,y:f2.y-100,val:'-'+scaled+(scaled<raw?'!':''),life:30,color:'#ff0'});
        spawnP(f2.x,f2.y-100,25,'#800',{spread:1.5,spark:false});
        spawnP(f2.x,f2.y-100,10,'#f00',{spread:1.2,spark:true});
        f1.meter=Math.min(f1.maxMeter,f1.meter+.8);
        hitstop=4;shakeX=(Math.random()-.5)*15;shakeY=(Math.random()-.5)*15;
      }else{hitstop=2;spawnP(f2.x,f2.y-100,4,'#44f',{spread:.6})}
    }
  }
  const b2=f2.getActiveBox();
  if(b2&&!f1.invuln&&!f1.knockInvuln){
    const db={x:f1.left,y:f1.top+(f1.crouching?80:0),w:f1.w,h:f1.h-(f1.crouching?80:0)};
    if(rectHit(b2,db)){
      const block=f1.blocking;
      let raw=(f2.attackDmg||5);
      const scaled=Math.round(raw*getComboScale());
      f1.takeHit(scaled,block?10:22,(f1.x-f2.x>0?1:-1)*(block?2:8),block);
      if(!block){
        comboCount++;comboOwner=f2;comboTimer=45;
        dmgDisplay.push({x:f1.x,y:f1.y-100,val:'-'+scaled+(scaled<raw?'!':''),life:30,color:'#ff0'});
        spawnP(f1.x,f1.y-100,25,'#800',{spread:1.5,spark:false});
        spawnP(f1.x,f1.y-100,10,'#f00',{spread:1.2,spark:true});
        f2.meter=Math.min(f2.maxMeter,f2.meter+.8);
        hitstop=4;shakeX=(Math.random()-.5)*15;shakeY=(Math.random()-.5)*15;
      }else{hitstop=2;spawnP(f1.x,f1.y-100,4,'#44f',{spread:.6})}
    }
  }
}
function pushApart(){
  const o=24;
  if(f1.right+o>f2.left&&f1.left<f2.right+o){
    if(Math.abs(f1.y - f2.y) < 90) {
      const mid=(f1.x+f2.x)/2,d=f1.w+o;
      f1.x=mid-d/2;f2.x=mid+d/2;
      f1.x=clamp(f1.x,WL+f1.w/2,WR-f1.w/2);
      f2.x=clamp(f2.x,WL+f2.w/2,WR-f2.w/2);
    }
  }
}

// ─── RENDER ───────────────────────────────────────────────────
function drawBG(){
  // Sky Gradient
  const sky=ctx.createLinearGradient(0,0,0,GND);
  sky.addColorStop(0,'#040a18');
  sky.addColorStop(0.5,'#1a0c1e');
  sky.addColorStop(1,'#4a1515');
  ctx.fillStyle=sky;ctx.fillRect(0,0,W,GND);

  // Moon with glow
  ctx.fillStyle='#ffe6b3';
  ctx.beginPath();ctx.arc(W-200,120,50,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='rgba(255,230,179,0.15)';
  ctx.beginPath();ctx.arc(W-200,120,80,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='rgba(255,230,179,0.05)';
  ctx.beginPath();ctx.arc(W-200,120,120,0,Math.PI*2);ctx.fill();

  // Distant Mountains
  ctx.fillStyle='#11050a';
  ctx.beginPath();
  ctx.moveTo(0,GND);ctx.lineTo(0,GND-80);ctx.lineTo(150,GND-220);
  ctx.lineTo(320,GND-110);ctx.lineTo(500,GND-280);ctx.lineTo(650,GND-130);
  ctx.lineTo(820,GND-240);ctx.lineTo(W,GND-120);ctx.lineTo(W,GND);
  ctx.fill();

  // Fog at horizon
  const fog=ctx.createLinearGradient(0,GND-40,0,GND);
  fog.addColorStop(0,'rgba(74,21,21,0)');
  fog.addColorStop(1,'rgba(74,21,21,0.6)');
  ctx.fillStyle=fog;ctx.fillRect(0,GND-40,W,40);

  // Dojo Wooden Floor
  const floor=ctx.createLinearGradient(0,GND,0,H);
  floor.addColorStop(0,'#3a1c0d');
  floor.addColorStop(1,'#0d0602');
  ctx.fillStyle=floor;ctx.fillRect(0,GND,W,H-GND);

  // Floor perspective boards
  ctx.strokeStyle='rgba(0,0,0,0.4)';ctx.lineWidth=3;
  for(let i=-20;i<40;i++){
    ctx.beginPath();
    ctx.moveTo(W/2+i*50,GND);ctx.lineTo(W/2+i*130,H);
    ctx.stroke();
  }

  // Details on floor
  ctx.fillStyle='rgba(80,10,10,0.3)';
  ctx.beginPath();ctx.ellipse(300,GND+40,60,15,0,0,Math.PI*2);ctx.fill();
  ctx.beginPath();ctx.ellipse(700,GND+60,40,10,0,0,Math.PI*2);ctx.fill();

  // Giant Symbol
  ctx.save();ctx.translate(W/2,220);
  ctx.fillStyle='rgba(180,20,20,0.15)';
  ctx.font='180px "Passion One",sans-serif';
  ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.fillText('武',0,0);ctx.restore();
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
  const mf1=$('hud-p1-meter'),mf2=$('hud-p2-meter');
  mf1.classList.toggle('full',f1.meter>=f1.maxMeter);
  mf2.classList.toggle('full',f2.meter>=f2.maxMeter);
  const gf1=$('hud-p1-gf'),gf2=$('hud-p2-gf');
  if(gf1)gf1.style.width=(f1.blocksRemaining/2*100)+'%';
  if(gf2)gf2.style.width=(f2.blocksRemaining/2*100)+'%';
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
  SND.init();
  for(const k in keys)keys[k]=false;
  f1=new Fighter(CHAR_IDS[selP1],true);
  f2=new Fighter(CHAR_IDS[selP2],false);
  f1.reset(220,true);f2.reset(740,false);
  
  let p1Name = CHARS[CHAR_IDS[selP1]].name.toUpperCase();
  let p2Name = CHARS[CHAR_IDS[selP2]].name.toUpperCase();
  
  if (mode === 'multi') {
    const myNameInput = $('player-name-input');
    const myName = (myNameInput && myNameInput.value.trim() || 'JUGADOR').toUpperCase();
    const oppName = (opponentName || 'RIVAL').toUpperCase();
    if (myRole === 'p1') {
      p1Name = myName + ' (' + p1Name + ')';
      p2Name = oppName + ' (' + p2Name + ')';
    } else {
      p2Name = myName + ' (' + p2Name + ')';
      p1Name = oppName + ' (' + p1Name + ')';
    }
  } else if (mode === '1p') {
    p2Name += ' (CPU)';
  }
  
  hud.name[0].textContent = p1Name;
  hud.name[1].textContent = p2Name;
  timer=99;particles=[];projectiles=[];dmgDisplay=[];
  comboCount=0;comboOwner=null;comboTimer=0;
  hitstop=0;shakeX=0;shakeY=0;roundOver=false;
  remoteKeys={};multiplayerSyncFrame=0;
  state='countdown';stateTimer=105;
  hideMsg();hide($('select-screen'));
  show($('game-hud'));canvas.classList.add('visible');
  hud.round.textContent='ROUND '+round;
  hud.score.textContent=p1Wins+'-'+p2Wins;
  updateUI();
  SND.round();
  setTimeout(()=>SND.fight(),600);
}

function endRound(winner){
  if(winner===1)p1Wins++;else p2Wins++;
  hud.score.textContent=p1Wins+'-'+p2Wins;
  const n1=CHARS[CHAR_IDS[selP1]].name.toUpperCase();
  const n2=CHARS[CHAR_IDS[selP2]].name.toUpperCase();
  if(p1Wins>=2){state='gameover';showMsg(n1+' GANA','¡'+CHARS[CHAR_IDS[selP1]].name+' es campeón!');SND.win()}
  else if(p2Wins>=2){state='gameover';showMsg(n2+' GANA','¡'+CHARS[CHAR_IDS[selP2]].name+' es campeón!');SND.win()}
  else{state='roundend';round++;showMsg(winner===1?n1:n2,'¡Gana la ronda!');SND.win();setTimeout(startFight,2500)}
  updateUI();
}

function goToMenu(){
  if(mode==='multi'&&socket){socket.emit('leave_matchmaking');socket.disconnect();socket=null;}
  for(const k in keys)keys[k]=false;
  hide(overlay);hide($('game-hud'));canvas.classList.remove('visible');
  hide($('select-screen'));hide($('controls-screen'));show($('menu-screen'));
  state='menu';p1Wins=0;p2Wins=0;round=1;
}

function goToSelect(){
  selP1=0;selP2=1;selR1=false;selR2=false;selCD1=0;selCD2=0;
  hide($('menu-screen'));hide($('controls-screen'));show($('select-screen'));
  state='select';drawSelect();SND.fight();
}

// ─── MENU / SELECT LOGIC ──────────────────────────────────────
function handleMenu(){
  const items=document.querySelectorAll('#menu-options .menu-item');
  if((keys['ArrowUp']||keys['w'])&&!menuCD){menuSel=(menuSel-1+4)%4;menuCD=10;SND.select()}
  if((keys['ArrowDown']||keys['s'])&&!menuCD){menuSel=(menuSel+1)%4;menuCD=10;SND.select()}
  if(menuCD>0)menuCD--;
  items.forEach((e,i)=>e.classList.toggle('selected',i===menuSel));
  if(keys['Enter']||keys[' ']){
    if(menuSel===0){keys['Enter']=false;keys[' ']=false;mode='1p';isMultiplayer=false;SND.select();goToSelect()}
    else if(menuSel===1){keys['Enter']=false;keys[' ']=false;mode='2p';isMultiplayer=false;SND.select();goToSelect()}
    else if(menuSel===2){
      keys['Enter']=false;keys[' ']=false;
      mode='multi';isMultiplayer=true;
      show($('matchmaking-screen'));
      hide($('menu-screen'));
      SND.select();
      connectMultiplayer();
    }
    else if(menuSel===3){keys['Enter']=false;keys[' ']=false;
      hide($('menu-screen'));show($('controls-screen'));state='controls'}
  }
}

function connectMultiplayer(){
  if(typeof io === 'undefined'){
    alert("Socket.io no cargado o el servidor local no está corriendo.");
    hide($('loading-screen')); show($('menu-screen'));
    return;
  }
  if(!socket) {
    socket = io();
    show($('cancel-match-btn'));
    show($('loading-screen'));
    hide($('menu-screen'));
    hide($('matchmaking-screen'));
    socket.on('match_found', (data) => {
      myRole = data.role;
      opponentName = data.opponentName || '';
      hide($('cancel-match-btn'));
      hide($('loading-screen'));
      selP1 = 0; selP2 = 1;
      selR1 = true; selR2 = true;
      p1Wins = 0; p2Wins = 0; round = 1;
      startFight();
    });
    socket.on('game_input', (data) => {
      // Las teclas del rival se guardan en remoteKeys, NO en keys locales
      if(data && typeof data.key === 'string' && typeof data.state === 'boolean') remoteKeys[data.key] = data.state;
    });
    socket.on('game_state', (data) => {
      if(myRole!=='p2' || !data || !f1 || !f2) return;
      applyFighterSnapshot(f1, data.f1);
      applyFighterSnapshot(f2, data.f2);
      if(typeof data.state==='string') state=data.state;
      if(typeof data.stateTimer==='number') stateTimer=data.stateTimer;
      if(typeof data.timer==='number') timer=data.timer;
      if(typeof data.round==='number') round=data.round;
      if(typeof data.p1Wins==='number') p1Wins=data.p1Wins;
      if(typeof data.p2Wins==='number') p2Wins=data.p2Wins;
      if(typeof data.roundOver==='boolean') roundOver=data.roundOver;
      if(data.message){
        msgTitle.textContent=data.message.title||'';
        msgSub.textContent=data.message.subtitle||'';
        data.message.visible?show(overlay):hide(overlay);
      }
      updateUI();
    });
    socket.on('opponent_disconnected', () => {
      alert("El oponente se ha desconectado.");
      remoteKeys={};myRole=null;isMultiplayer=false;
      if(socket){socket.disconnect();socket=null;}
      hide($('cancel-match-btn'));
      hide($('loading-screen'));
      show($('menu-screen'));
    });
  }
  const nameInput = $('player-name-input');
  socket.emit('join_matchmaking', { name: nameInput && nameInput.value || '' });
}

$('cancel-match-btn').onclick = () => {
  if(socket){socket.emit('leave_matchmaking');socket.disconnect();socket=null;}
  remoteKeys={};myRole=null;isMultiplayer=false;
  hide($('loading-screen')); hide($('matchmaking-screen')); show($('menu-screen'));
};

var mmCancel = $('mm-cancel');
if(mmCancel)mmCancel.onclick = $('cancel-match-btn').onclick;

function handleControls(){
  if(keys['Enter']||keys[' ']||keys['Escape']){
    keys['Enter']=false;keys[' ']=false;keys['Escape']=false;
    show($('menu-screen'));hide($('controls-screen'));state='menu';
  }
}

function handleSelect(){
  const total=CHAR_IDS.length;
  // P1: WASD + J to confirm
  if((keys['a']||keys['A'])&&!selCD1){selP1=(selP1-1+total)%total;selCD1=10;selR1=false;SND.select()}
  if((keys['d']||keys['D'])&&!selCD1){selP1=(selP1+1)%total;selCD1=10;selR1=false;SND.select()}
  if((keys['w']||keys['W'])&&!selCD1){selP1=(selP1-3+total)%total;selCD1=10;selR1=false;SND.select()}
  if((keys['s']||keys['S'])&&!selCD1){selP1=(selP1+3)%total;selCD1=10;selR1=false;SND.select()}
  if((keys['j']||keys['J'])&&!selR1){keys['j']=false;keys['J']=false;selR1=true;SND.fight()}

  // P2: Arrows + Enter/1 to confirm
  if(mode==='2p'){
    if((keys['ArrowLeft'])&&!selCD2){selP2=(selP2-1+total)%total;selCD2=10;selR2=false;SND.select()}
    if((keys['ArrowRight'])&&!selCD2){selP2=(selP2+1)%total;selCD2=10;selR2=false;SND.select()}
    if((keys['ArrowUp'])&&!selCD2){selP2=(selP2-3+total)%total;selCD2=10;selR2=false;SND.select()}
    if((keys['ArrowDown'])&&!selCD2){selP2=(selP2+3)%total;selCD2=10;selR2=false;SND.select()}
    if((keys['1'])&&!selR2){keys['1']=false;selR2=true;SND.fight()}
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
var loadTimer=2500;
var loadStart=Date.now();
function gameLoop(){
  if(state==='loading'){
    var elapsed=Date.now()-loadStart;
    if(elapsed>=loadTimer){
      state='menu';
      var ls=document.getElementById('loading-screen');
      var ms=document.getElementById('menu-screen');
      if(ls)ls.style.display='none';
      if(ms)ms.style.display='flex';
    }
  }
  if(state==='menu')handleMenu();
  else if(state==='controls')handleControls();
  else if(state==='select')handleSelect();
  else if(state==='countdown' && !(mode==='multi'&&myRole==='p2')){
    f1.update();f2.update();pushApart();updProj();updP();
    stateTimer--;if(stateTimer<=0)state='fighting';
  }else if(state==='fighting' && !(mode==='multi'&&myRole==='p2')){
    if(hitstop>0)hitstop--;
    else{handleFightInput();f1.update();f2.update();pushApart();checkHits();
      updProj();updP();timer-=1/60;if(timer<0)timer=0;updateUI();
      if(comboTimer>0)comboTimer--;else{comboCount=0;comboOwner=null}
      if(f1.hp<=0&&!roundOver){
        if(p2Wins===1){state='finish_him';stateTimer=180;showMsg('FINISH HIM','');f1.hp=0;SND.fatality();}
        else{roundOver=true;spawnP(f1.x,f1.y-100,40,'#800',{spread:2});endRound(2);}
      }
      else if(f2.hp<=0&&!roundOver){
        if(p1Wins===1){state='finish_him';stateTimer=180;showMsg('FINISH HIM','');f2.hp=0;SND.fatality();}
        else{roundOver=true;spawnP(f2.x,f2.y-100,40,'#800',{spread:2});endRound(1);}
      }
      else if(timer<=0&&!roundOver){roundOver=true;
        if(f1.hp>f2.hp)endRound(1);else if(f2.hp>f1.hp)endRound(2);
        else endRound(0);
      }
    }
  }else if(state==='finish_him' && !(mode==='multi'&&myRole==='p2')){
    if(hitstop>0)hitstop--;
    else {
      handleFightInput();f1.update();f2.update();pushApart();updProj();updP();
      const w=f1.hp<=0?f2:f1;const l=f1.hp<=0?f1:f2;
      l.state='hitstun';l.hitstun=10;l.vy=0;l.vx=0;
      stateTimer--;
      if(stateTimer<=0){roundOver=true;endRound(w===f1?1:2);}
      if(w.state==='attack' && w.move && w.move.fatality){
        w.state='idle'; w.movePhase='none'; state='fatality'; stateTimer=240;
        document.body.style.backgroundColor='#200';
        SND.fatality();
        l.sprite.play('dead'); w.sprite.play('attack2');
        spawnP(l.x,l.y-100,400,'#a00',{spread:8,spark:false}); // Lluvia brutal
        spawnP(l.x,l.y-50,200,'#f00',{spread:6,spark:true});
        shakeX=30;shakeY=30;hitstop=10;
        msgTitle.textContent="FATALITY";msgTitle.style.color="#f00";msgTitle.style.fontSize="100px";
        msgSub.textContent=w.name.toUpperCase()+" WINS";
        show(overlay);hide($('restart-btn'));hide($('menu-btn'));
      }
    }
  }else if(state==='fatality' && !(mode==='multi'&&myRole==='p2')){
    if(hitstop>0)hitstop--;
    updP();
    
    // Animar al ganador normal, y al perdedor lento para una muerte cinemática
    const w=f1.hp<=0?f2:f1;const l=f1.hp<=0?f1:f2;
    w.sprite.update(1);
    l.sprite.update(0.12); // Cámara lenta
    
    // Mover un poco hacia abajo y añadir más sangre poco a poco
    if(stateTimer % 5 === 0) {
      spawnP(l.x,l.y-50,15,'#800',{spread:2,spark:false, gravity: 0.1});
    }

    stateTimer--;
    if(stateTimer<=0){
      document.body.style.backgroundColor='';
      msgTitle.style.fontSize="";msgTitle.style.color="";
      show($('restart-btn'));show($('menu-btn'));
      roundOver=true;endRound(f1.hp<=0?2:1);
    }
  }

  emitMultiplayerState();

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
  // Si el foco está en un input de texto, no interceptar para poder escribir
  if(e.target && e.target.tagName === 'INPUT') return;

  if (mode==='multi' && isMultiplayer && myRole) {
    const myK = myRole==='p1' ? KEYS.p1 : KEYS.p2;
    const isMyKey = Object.values(myK).includes(e.key) || Object.values(myK).includes(e.key.toLowerCase());
    if(isMyKey){
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
  // Si el foco está en un input de texto, no interceptar
  if(e.target && e.target.tagName === 'INPUT') return;

  if(mode==='multi' && isMultiplayer && myRole){
    const myK = myRole==='p1' ? KEYS.p1 : KEYS.p2;
    const isMyKey = Object.values(myK).includes(e.key) || Object.values(myK).includes(e.key.toLowerCase());
    if(isMyKey){
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
window.addEventListener('blur',()=>{
  if(mode!=='multi'||!myRole) return;
  const myK=myRole==='p1'?KEYS.p1:KEYS.p2;
  Object.values(myK).forEach(key=>{
    if(keys[key]){
      keys[key]=false;
      if(socket)socket.emit('game_input',{key,state:false});
    }
  });
});
rstBtn.addEventListener('click',()=>{
  if(state==='gameover'){p1Wins=0;p2Wins=0;round=1;startFight()}
});
menuBtn.addEventListener('click',goToMenu);
var controlsBack=$('controls-back');
if(controlsBack)controlsBack.addEventListener('click',()=>{
  if(state==='controls'){show($('menu-screen'));hide($('controls-screen'));state='menu'}
});

// ─── START ────────────────────────────────────────────────────
SND.init();
var ls=document.getElementById('loading-screen');
if(ls)ls.style.display='flex';
loadSprites(function(){});
state='loading';
gameLoop();
