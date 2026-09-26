// Gas giant baker — a port of Kupiter (C:/Users/ofici/Downloads/Kupiter/gas-giant-generator.html)
// onto the game's renderer. Per planet it bakes:
//   * a divergence-free wind field (zonal jets + curl turbulence + elliptical vortices)
//   * the albedo map, by integrating every pixel BACKWARDS through that field (RK2) and shading
//     the banded / filamentary / hazy material at the advected coordinate
//   * a flow map (east, north wind) that the runtime shader uses to keep the clouds moving and
//     the storms swirling — for procedural giants AND for the real Jupiter/Saturn/Uranus/Neptune
// Work is split into horizontal strips so a bake never stalls a frame.
import * as THREE from 'three';
import { rng as mulberry32, hashStr } from '../core/math.js';
import { IS_MOBILE } from '../render/textures.js';

const MAX_SPOTS = 12, MAX_STEPS = 420;
const G_COMMON = /* glsl */`
const float PI  = 3.141592653589793;
const float TAU = 6.283185307179586;
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0); const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy)); vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz); vec3 l=1.0-g; vec3 i1=min(g.xyz,l.zxy); vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx; vec3 x2=x0-i2+C.yyy; vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857; vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z);
  vec4 x_=floor(j*ns.z); vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy; vec4 y=y_*ns.x+ns.yyyy; vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0; vec4 s1=floor(b1)*2.0+1.0; vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x); vec3 p1=vec3(a0.zw,h.y); vec3 p2=vec3(a1.xy,h.z); vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0); m=m*m;
  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}
float hash11(float n){ return fract(sin(n*127.1)*43758.5453123); }
float hash21(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123); }
float fbm(vec3 p,int oct,float lac,float gain){
  float a=0.5,f=1.0,s=0.0,n=0.0;
  for(int i=0;i<10;i++){ if(i>=oct)break; s+=a*snoise(p*f); n+=a; f*=lac; a*=gain; }
  return s/max(n,1e-4);
}
float fbmNorm(int oct,float gain){ return 0.5*(1.0-pow(gain,float(oct)))/max(1.0-gain,1e-4); }
float fbmF(vec3 p,int oct,float fp,float lac,float gain){
  float a=0.5,f=1.0,s=0.0;
  for(int i=0;i<10;i++){ if(i>=oct)break; float fade=clamp(1.8-fp*f*3.6,0.0,1.0); if(fade<=0.0) break; s+=a*fade*snoise(p*f); f*=lac; a*=gain; }
  return s/fbmNorm(oct,gain);
}
float ridgedF(vec3 p,int oct,float fp,float lac,float gain){
  float a=0.5,f=1.0,s=0.0,n=0.0;
  for(int i=0;i<10;i++){ if(i>=oct)break; float fade=clamp(1.8-fp*f*3.6,0.0,1.0); float v=1.0-abs(snoise(p*f)); v*=v; s+=a*mix(0.5,v,fade); n+=a; f*=lac; a*=gain; }
  return s/max(n,1e-4);
}
vec3 uvToSphere(vec2 uv){ float lon=(uv.x-0.5)*TAU, lat=(uv.y-0.5)*PI, cl=cos(lat); return vec3(cl*cos(lon), sin(lat), cl*sin(lon)); }
vec2 sphereToUv(vec3 p){ return vec2(atan(p.z,p.x)/TAU+0.5, asin(clamp(p.y,-1.0,1.0))/PI+0.5); }
vec3 eastAt(vec3 p){ vec3 t=cross(vec3(0.0,1.0,0.0),p); float l=length(t); return l>1e-5 ? t/l : vec3(1.0,0.0,0.0); }
float bandCoord(float lat,float cnt,float irreg,float seed){
  float x=(lat/PI+0.5)*cnt;
  x += irreg*(snoise(vec3(x*0.45,seed*2.7,9.1))*0.80 + snoise(vec3(x*1.10,seed*1.3,3.4))*0.25);
  return x;
}
#define MAX_SPOTS ${MAX_SPOTS}
uniform int  uSpotCount;
uniform vec4 uSpotPos[MAX_SPOTS];
uniform vec4 uSpotShape[MAX_SPOTS];
`;
const G_FIELD = /* glsl */`
uniform float uSeed,uZonal,uTurb,uTurbScale,uEddyAspect,uPoleTaper;
uniform float uBandCount,uBandIrreg,uBandAsym;
uniform int   uTurbOct;
uniform float uPhase;
uniform int   uSmallCount;
uniform float uSmallSpin,uSmallSize;
float jetSpeed(float lat){
  float x=bandCoord(lat,uBandCount,uBandIrreg,uSeed);
  float amp=1.0+uBandAsym*snoise(vec3(x*0.5,uSeed*1.9,5.5));
  return sin(x*PI)*amp*uZonal*pow(max(cos(lat),0.0),uPoleTaper);
}
float psiNoise(vec3 p,float ph){
  float taper=pow(max(1.0-p.y*p.y,0.0),uPoleTaper*0.5);
  vec3 c=vec3(p.x,p.y*uEddyAspect,p.z)*uTurbScale + vec3(uSeed*11.3+ph*53.1, uSeed*4.7-ph*29.7, 7.2+ph*41.3);
  float s=fbm(c,uTurbOct,2.0,0.28) + 0.12*fbm(c*3.1+5.0,min(uTurbOct,4),2.0,0.30);
  return s*taper;
}
vec3 vNoise(vec3 p,float ph){
  const float e=0.006; float c0=psiNoise(p,ph);
  vec3 g=vec3(psiNoise(p+vec3(e,0.0,0.0),ph)-c0, psiNoise(p+vec3(0.0,e,0.0),ph)-c0, psiNoise(p+vec3(0.0,0.0,e),ph)-c0)/e;
  return cross(g,p)*(uTurb/max(uTurbScale*uEddyAspect,0.2));
}
float vortexProfile(float u){ float k=1.0-u*u; return 6.75*u*u*k*k; }
float vortexRadius(vec3 p,vec3 c,float R,float aspect,float tilt,out vec2 tv){
  tv=vec2(0.0); if(dot(p,c)<=0.0) return 1e9;
  vec3 e=eastAt(c), n=normalize(cross(c,e)); float ct=cos(tilt), st=sin(tilt);
  vec3 ax=e*ct+n*st, ay=n*ct-e*st; vec3 t=p-c*dot(p,c);
  tv=vec2(dot(t,ax)/(R*aspect), dot(t,ay)/R); return length(tv);
}
vec3 vortexVel(vec3 p,vec3 c,float R,float aspect,float tilt,float spin){
  vec2 tv; float u=vortexRadius(p,c,R,aspect,tilt,tv);
  if(u>=1.0||u<1e-6) return vec3(0.0);
  vec3 e=eastAt(c), n=normalize(cross(c,e)); float ct=cos(tilt), st=sin(tilt);
  vec3 ax=e*ct+n*st, ay=n*ct-e*st;
  vec3 g=(ax*(tv.x/(R*aspect))+ay*(tv.y/R))/u*(spin*R*vortexProfile(u));
  return cross(g,p);
}
vec3 stormCentre(float i){
  float lon=hash11(i*12.9898+uSeed*7.13)*TAU; float bi=floor(hash11(i*45.23+uSeed*3.7)*uBandCount);
  float fr=0.5+(hash11(i*91.7+uSeed*1.7)-0.5)*0.55; float lat=((bi+fr)/uBandCount-0.5)*PI*0.92; float cl=cos(lat);
  return vec3(cl*cos(lon),sin(lat),cl*sin(lon));
}
float stormRadius(float i){ return (0.020+hash11(i*4.1+uSeed*2.2)*0.050)*PI*uSmallSize; }
float stormSpin(float i){ float bi=floor(hash11(i*45.23+uSeed*3.7)*uBandCount); return (mod(bi,2.0)<0.5?1.0:-1.0)*uSmallSpin*(0.6+hash11(i*33.1+uSeed)*0.8); }
vec3 windAt(vec3 p){
  float lat=asin(clamp(p.y,-1.0,1.0));
  vec3 v=eastAt(p)*jetSpeed(lat) + vNoise(p,uPhase);
  for(int i=0;i<MAX_SPOTS;i++){ if(i>=uSpotCount) break; if(uSpotShape[i].w<0.5) continue; v+=vortexVel(p,uSpotPos[i].xyz,uSpotPos[i].w,uSpotShape[i].x,0.0,uSpotShape[i].y); }
  for(int i=0;i<32;i++){ if(i>=uSmallCount) break; float fi=float(i)+1.0; float asp=1.25+hash11(fi*7.7+uSeed*5.1)*0.9; v+=vortexVel(p,stormCentre(fi),stormRadius(fi),asp,0.0,stormSpin(fi)); }
  return v-dot(v,p)*p;
}
`;
const VS = `precision highp float; in vec3 position; in vec2 uv; out vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const BAKE_FS = `precision highp float; in vec2 vUv; out vec4 o;
${G_COMMON}
${G_FIELD}
uniform int uMode; // 0 = raw wind vector (xyz), 1 = engine flow map (east, north)
void main(){ vec3 p = uvToSphere(vUv); vec3 v = windAt(p);
  if (uMode == 0) { o = vec4(v, 0.0); return; }
  vec3 e = eastAt(p), n = normalize(cross(p, e)); o = vec4(dot(v, e), dot(v, n), 0.0, 1.0); }`;
const SHADE_FS = `precision highp float; in vec2 vUv; out vec4 oCol;
uniform sampler2D uV0,uV1,uGradient;
uniform float uFlowTime,uEvolve; uniform int uSteps; uniform float uSeed;
uniform float uBandCount,uBandIrreg,uBandContrast,uBandVariety,uBandSharp,uBandWobble;
uniform float uPoleTaper,uTaperBands,uTaperDetail,uTaperHaze;
uniform float uDetailFreq,uDetailAmp,uDetailAniso,uFilament,uWarpAmt,uWisp; uniform int uOct;
uniform float uHazeAmt,uHazeFreq,uHazeThresh,uHazeSoft,uHazeAniso; uniform vec3 uHazeColor;
uniform vec4 uSpotTint[${MAX_SPOTS}];
uniform int uSmallCount; uniform float uSmallSize,uSmallSpin,uSmallTint; uniform vec3 uSmallCol;
uniform vec3 uPoleColor; uniform float uPoleAmt,uEqWarm; uniform float uBrightness,uContrast,uSaturation,uGamma;
${G_COMMON}
vec3 sampleVel(vec3 p,float w){ vec2 uv=sphereToUv(p); vec3 a=texture(uV0,uv).xyz; if(uEvolve<=0.002) return a; return mix(a,texture(uV1,uv).xyz,w); }
vec3 backtrace(vec3 p){
  float n=float(max(uSteps,1)); float dt=uFlowTime/n; vec3 q=p;
  for(int i=0;i<${MAX_STEPS};i++){ if(i>=uSteps) break; float w=(1.0-float(i)/n)*uEvolve; vec3 v1=sampleVel(q,w); vec3 m=normalize(q-v1*(dt*0.5)); vec3 v2=sampleVel(m,w); q=normalize(q-v2*dt); }
  return q;
}
float bandField(float x,float fw){
  float aa=clamp(1.6-fw*3.2,0.0,1.0); float k=min(max(uBandSharp,0.05)*2.0, 0.6/max(fw,1e-4));
  float s=tanh(sin(x*PI)*k)/tanh(k); float t=0.5+0.5*s*uBandContrast*aa;
  t+=uBandVariety*(snoise(vec3(x*0.60,uSeed*3.3,3.0))*0.60*clamp(1.8-fw*2.2,0.0,1.0)+snoise(vec3(x*1.70,uSeed*1.1,8.0))*0.25*clamp(1.8-fw*6.1,0.0,1.0));
  return t;
}
float ellRadius(vec3 x,vec3 c,float R,float aspect){ if(dot(x,c)<=0.0) return 1e9; vec3 e=eastAt(c), n=normalize(cross(c,e)); vec3 t=x-c*dot(x,c); return length(vec2(dot(t,e)/(R*aspect), dot(t,n)/R)); }
vec3 stormCentre(float i){ float lon=hash11(i*12.9898+uSeed*7.13)*TAU; float bi=floor(hash11(i*45.23+uSeed*3.7)*uBandCount); float fr=0.5+(hash11(i*91.7+uSeed*1.7)-0.5)*0.55; float lat=((bi+fr)/uBandCount-0.5)*PI*0.92; float cl=cos(lat); return vec3(cl*cos(lon),sin(lat),cl*sin(lon)); }
float stormRadius(float i){ return (0.020+hash11(i*4.1+uSeed*2.2)*0.050)*PI*uSmallSize; }
vec3 stormTint(vec3 col,float u,vec3 tintCol,float amt,float detail,float det){
  if(u>=1.0||amt<=0.0) return col; float m=1.0-smoothstep(0.80,1.0,u); float lum=dot(col,vec3(0.3333));
  vec3 core=clamp(tintCol*(0.42+1.20*lum)*(1.0+det*detail*(1.0-u*u)*0.6),0.0,1.0);
  float collar=smoothstep(0.52,0.86,u)*(1.0-smoothstep(0.88,1.0,u)); core=mix(core, mix(core,vec3(1.0),0.45), collar);
  return mix(col, core, m*amt);
}
void main(){
  vec3 p=uvToSphere(vUv); vec3 q=backtrace(p);
  vec3 aq=vec3(q.x,q.y*uDetailAniso,q.z)*uDetailFreq; float fpa=max(length(dFdx(aq)),length(dFdy(aq)));
  vec3 w1=vec3(fbmF(aq+vec3(0.0,0.0,uSeed),uOct,fpa,2.0,0.5), fbmF(aq+vec3(5.2,1.3,uSeed+2.0),uOct,fpa,2.0,0.5), fbmF(aq+vec3(9.7,4.1,uSeed+7.0),uOct,fpa,2.0,0.5));
  vec3 bq=aq+w1*vec3(1.0,0.35,1.0)*uWarpAmt*2.0; float fpb=max(length(dFdx(bq)),length(dFdy(bq)));
  float det=fbmF(bq,uOct,fpb,2.03,0.5);
  float fil=ridgedF(bq*2.2+vec3(3.0,uSeed,1.0),min(uOct,7),fpb*2.2,2.1,0.5);
  float wisp =ridgedF(bq* 7.0+vec3(9.0,uSeed*2.0,4.0),min(uOct,9),fpb* 7.0,2.15,0.5);
  float wisp2=  fbmF(bq*17.0+vec3(2.0,6.0,uSeed*3.0),min(uOct,9),fpb*17.0,2.20,0.5);
  float fpq=max(length(dFdx(q)),length(dFdy(q))); float wob=fbmF(q*1.6+uSeed, 3, fpq*1.6, 2.3, 0.45);
  float latq=asin(clamp(q.y,-1.0,1.0)); float x=bandCoord(latq+wob*uBandWobble*0.12, uBandCount,uBandIrreg,uSeed); float band=bandField(x,fwidth(x));
  float polar=pow(max(1.0-p.y*p.y,0.0),uPoleTaper*0.5);
  float tapB=mix(1.0,polar,uTaperBands), tapD=mix(1.0,polar,uTaperDetail), tapH=mix(1.0,polar,uTaperHaze);
  band=0.5+(band-0.5)*tapB;
  float t=band + (det*uDetailAmp + (fil-0.45)*uFilament + (wisp-0.5)*uWisp + wisp2*uWisp*0.55)*tapD;
  vec3 col=texture(uGradient,vec2(clamp(t,0.0,1.0),0.5)).rgb;
  vec3 hq=vec3(q.x,q.y*uHazeAniso,q.z)*uHazeFreq + w1*uWarpAmt + vec3(17.0,4.0,uSeed*1.7);
  float fph=max(length(dFdx(hq)),length(dFdy(hq))); float hf=fbmF(hq, min(uOct,6), fph, 2.1,0.5)*0.5+0.5;
  float hs=max(uHazeSoft, fwidth(hf)*1.5); float cover=smoothstep(uHazeThresh-hs,uHazeThresh+hs,hf); cover*=mix(0.30,1.0,smoothstep(0.30,0.75,band));
  col=mix(col,uHazeColor,cover*uHazeAmt*tapH);
  float aLat=abs(p.y); col=mix(col,uPoleColor,smoothstep(0.55,0.97,aLat)*uPoleAmt); col=mix(col,col*vec3(1.10,1.00,0.86),smoothstep(0.35,0.0,aLat)*uEqWarm);
  float rim=det*0.13;
  for(int i=0;i<MAX_SPOTS;i++){ if(i>=uSpotCount) break; if(uSpotShape[i].w<0.5) continue; float u=ellRadius(p,uSpotPos[i].xyz,uSpotPos[i].w,uSpotShape[i].x)+rim*uSpotShape[i].z; if(u<1.0) col=stormTint(col,u,uSpotTint[i].rgb,uSpotTint[i].a,uSpotShape[i].z,det); }
  for(int i=0;i<32;i++){ if(i>=uSmallCount) break; float fi=float(i)+1.0; float asp=1.25+hash11(fi*7.7+uSeed*5.1)*0.9; float u=ellRadius(p,stormCentre(fi),stormRadius(fi),asp)+rim*0.5; if(u<1.0){ vec3 tc2=mix(uSmallCol, vec3(1.0), 0.40+0.55*hash11(fi*3.3+uSeed)); col=stormTint(col,u,tc2,uSmallTint,0.28,det); } }
  col=(col-0.5)*uContrast+0.5+uBrightness; float lu=dot(col,vec3(0.2126,0.7152,0.0722)); col=mix(vec3(lu),col,uSaturation); col=pow(clamp(col,0.0,1.0),vec3(1.0/uGamma));
  col+=(hash21(gl_FragCoord.xy)-0.5)/255.0;
  oCol=vec4(clamp(col,0.0,1.0),1.0);
}`;

// ---------------------------------------------------------------- presets (from Kupiter)
const SPOT = { on: 1, lon: 0, lat: 0, size: 0.12, aspect: 1.75, spin: 2.10, detail: 0.55, tint: 0.50, color: '#c06a3e' };
const DEF = { bandCount: 10, bandContrast: 0.60, bandSharp: 1.00, bandVariety: 0.22, bandIrreg: 0.30, bandAsym: 0.40, bandWobble: 0.45, taperBands: 0.55,
  flowTime: 0.75, steps: 190, zonal: 0.95, turb: 0.55, turbScale: 1.90, eddyAspect: 5.00, evolve: 0.35, poleTaper: 1.30, turbOct: 6,
  detailFreq: 3.6, octaves: 9, detailAmp: 0.20, detailAniso: 4.20, warpAmt: 0.45, filament: 0.07, wisp: 0.10, taperDetail: 0.45,
  hazeAmt: 0.40, hazeFreq: 3.40, hazeAniso: 4.00, hazeThresh: 0.56, hazeSoft: 0.115, taperHaze: 0, hazeColor: '#f3f0e8',
  smallCount: 11, smallSize: 0.70, smallSpin: 1.45, smallTint: 0.40, smallCol: '#c06a3e',
  brightness: 0, contrast: 1.0, saturation: 0.92, gamma: 1.0, poleColor: '#c4cfd2', poleAmt: 0.30, eqWarm: 0.22, spots: [] };
export const GG_PRESETS = {
  'Pale Giant': { grad: [[0, '#66797e'], [0.15, '#879c9d'], [0.31, '#adbebc'], [0.45, '#ccd7d3'], [0.56, '#e2e4dd'], [0.65, '#efeae0'], [0.76, '#eed4b6'], [0.88, '#e2ae83'], [1, '#cf8f68']],
    p: { bandCount: 10, bandSharp: 1.00, spots: [{ lon: 28, lat: -21, size: 0.16, spin: 2.25, tint: 0.5, color: '#c06a3e' }, { lon: -96, lat: 15, size: 0.095, aspect: 1.55, spin: -1.70, detail: 0.45, tint: 0.55, color: '#e8dcc8' }, { lon: 132, lat: -44, size: 0.080, aspect: 1.40, spin: 1.50, detail: 0.40, tint: 0.50, color: '#c98f5e' }], smallSpin: 1.76 } },
  Jupiter: { grad: [[0, '#6d563f'], [0.14, '#8f6f50'], [0.28, '#b08b62'], [0.42, '#cfa87a'], [0.55, '#e3c79c'], [0.68, '#eedcbd'], [0.80, '#f0e7d6'], [0.91, '#e8ecec'], [1, '#dfe9ef']],
    p: { bandCount: 17, bandContrast: 0.62, bandSharp: 2.20, bandVariety: 0.24, bandIrreg: 0.34, bandAsym: 0.45, bandWobble: 0.55, flowTime: 0.95, steps: 210, zonal: 1.05, turbScale: 2.70, eddyAspect: 3.40, evolve: 0.40, poleTaper: 1.40,
      detailFreq: 5.5, detailAmp: 0.26, detailAniso: 3.60, warpAmt: 0.48, filament: 0.13, hazeAmt: 0.38, hazeFreq: 3.60, hazeAniso: 3.40, hazeThresh: 0.55, hazeSoft: 0.14, hazeColor: '#f2ece0',
      spots: [{ lon: 25, lat: -22, size: 0.135, spin: 2.48, tint: 0.62, color: '#bb5b33' }, { lon: -58, lat: -38, size: 0.070, aspect: 1.60, spin: -1.85, detail: 0.45, tint: 0.40, color: '#f0e6d2' }, { lon: 150, lat: 23, size: 0.065, aspect: 1.45, spin: 1.60, detail: 0.45, tint: 0.38, color: '#d8a878' }, { lon: -142, lat: 41, size: 0.052, aspect: 1.35, spin: -1.40, detail: 0.40, tint: 0.30, color: '#efe7d8' }],
      smallCount: 18, smallSize: 0.60, smallSpin: 2.08, brightness: 0.01, contrast: 1.02, saturation: 1.04, poleColor: '#8fa0ac', poleAmt: 0.42, eqWarm: 0.40 } },
  Saturn: { grad: [[0, '#8a6a38'], [0.20, '#ab8b52'], [0.38, '#c9a869'], [0.55, '#dec489'], [0.72, '#ecdcaf'], [0.87, '#f4e9cc'], [1, '#faf3e0']],
    p: { bandCount: 28, bandContrast: 0.40, bandSharp: 1.30, bandVariety: 0.16, bandIrreg: 0.22, bandAsym: 0.30, bandWobble: 0.30, flowTime: 0.72, steps: 180, zonal: 1.20, turbScale: 3.00, eddyAspect: 4.40, evolve: 0.30, poleTaper: 1.80,
      detailFreq: 5.0, warpAmt: 0.34, filament: 0.08, hazeAmt: 0.55, hazeFreq: 2.80, hazeThresh: 0.50, hazeSoft: 0.18, hazeColor: '#f6efdc', spots: [], smallCount: 5, smallSize: 0.50, smallSpin: 0.96,
      brightness: 0.02, contrast: 0.98, saturation: 0.94, gamma: 1.02, poleColor: '#b9a887', poleAmt: 0.45, eqWarm: 0.26 } },
  Neptune: { grad: [[0, '#0d2452'], [0.24, '#1c4384'], [0.46, '#356cb4'], [0.64, '#6396cd'], [0.80, '#a2c5e6'], [0.92, '#d6e6f4'], [1, '#f2f7fc']],
    p: { bandCount: 9, bandContrast: 0.66, bandSharp: 1.20, bandVariety: 0.18, bandIrreg: 0.28, bandAsym: 0.35, bandWobble: 0.60, flowTime: 0.85, zonal: 0.85, turbScale: 3.20, eddyAspect: 2.40, evolve: 0.45, poleTaper: 1.20,
      detailFreq: 4.4, detailAmp: 0.26, detailAniso: 2.40, warpAmt: 0.52, filament: 0.12, hazeAmt: 0.40, hazeFreq: 3.80, hazeAniso: 2.40, hazeThresh: 0.58, hazeSoft: 0.13, hazeColor: '#eef4fb',
      spots: [{ lon: -40, lat: -28, size: 0.16, spin: 2.63, tint: 0.55, color: '#0b1a38' }, { lon: 88, lat: 34, size: 0.070, aspect: 1.50, spin: -1.90, detail: 0.50, tint: 0.45, color: '#eaf3fb' }],
      smallCount: 6, smallSize: 0.60, smallSpin: 1.92, contrast: 1.06, saturation: 1.10, gamma: 0.98, poleColor: '#12386c', poleAmt: 0.30, eqWarm: 0 } },
  Uranus: { grad: [[0, '#5fa79f'], [0.32, '#8dc4bd'], [0.58, '#b4dbd4'], [0.78, '#d6ece7'], [1, '#f0f8f5']],
    p: { bandCount: 7, bandContrast: 0.24, bandSharp: 0.80, bandVariety: 0.10, bandIrreg: 0.16, bandAsym: 0.15, bandWobble: 0.35, flowTime: 0.70, steps: 150, zonal: 0.70, turbScale: 2.40, eddyAspect: 3.40, evolve: 0.25, poleTaper: 2.20,
      detailFreq: 3.8, octaves: 8, detailAmp: 0.14, detailAniso: 3.00, warpAmt: 0.28, filament: 0.04, hazeAmt: 0.60, hazeFreq: 2.40, hazeAniso: 3.20, hazeThresh: 0.46, hazeSoft: 0.20, hazeColor: '#eaf6f3', spots: [],
      smallCount: 2, smallSize: 0.50, smallSpin: 0.64, brightness: 0.03, contrast: 0.92, saturation: 0.84, gamma: 1.04, poleColor: '#cdeae4', poleAmt: 0.26, eqWarm: 0 } },
  'Brown Dwarf': { grad: [[0, '#250706'], [0.18, '#65180e'], [0.38, '#a33616'], [0.56, '#d46524'], [0.72, '#ee9d4a'], [0.87, '#f7cb80'], [1, '#fce4b2']],
    p: { bandCount: 11, bandContrast: 0.76, bandSharp: 2.60, bandVariety: 0.26, bandIrreg: 0.36, bandAsym: 0.45, bandWobble: 0.60, flowTime: 1.10, steps: 230, zonal: 1.00, turbScale: 3.20, eddyAspect: 2.40, evolve: 0.50, poleTaper: 1.20,
      detailFreq: 6.0, detailAmp: 0.30, detailAniso: 2.20, warpAmt: 0.60, filament: 0.20, hazeAmt: 0.26, hazeFreq: 4.20, hazeAniso: 2.20, hazeThresh: 0.62, hazeSoft: 0.10, hazeColor: '#ffd9a0',
      spots: [{ lon: 60, lat: 18, size: 0.185, spin: 2.94, tint: 0.55, color: '#e0902e' }], smallCount: 16, smallSize: 0.80, smallSpin: 2.40, brightness: -0.01, contrast: 1.10, saturation: 1.16, gamma: 0.96, poleColor: '#3a1206', poleAmt: 0.34, eqWarm: 0.35 } },
  'Toxic Alien': { grad: [[0, '#0e2411'], [0.22, '#245420'], [0.42, '#54932c'], [0.58, '#a0cd48'], [0.72, '#d9e89e'], [0.85, '#bfa0cf'], [1, '#e7d7f0']],
    p: { bandCount: 13, bandContrast: 0.64, bandSharp: 2.20, bandVariety: 0.24, bandIrreg: 0.34, bandAsym: 0.45, bandWobble: 0.55, flowTime: 0.92, steps: 200, turbScale: 3.40, eddyAspect: 2.60, evolve: 0.45,
      detailFreq: 5.6, detailAmp: 0.28, detailAniso: 2.40, warpAmt: 0.55, filament: 0.18, hazeAmt: 0.28, hazeFreq: 4.00, hazeAniso: 2.40, hazeThresh: 0.60, hazeSoft: 0.11, hazeColor: '#e6f2d0',
      spots: [{ lon: -70, lat: 35, size: 0.14, spin: -2.48, tint: 0.5, color: '#7a3fb0' }], smallCount: 16, smallSpin: 2.08, contrast: 1.10, saturation: 1.24, gamma: 0.97, poleColor: '#3a2a5a', poleAmt: 0.34, eqWarm: 0.20 } },
  'Ice Titan': { grad: [[0, '#20405f'], [0.26, '#4a7cab'], [0.50, '#8ac0e2'], [0.72, '#cbe5f4'], [0.88, '#edf6fc'], [1, '#ffffff']],
    p: { bandCount: 12, bandContrast: 0.54, bandSharp: 1.60, bandVariety: 0.18, bandIrreg: 0.26, bandAsym: 0.35, flowTime: 0.82, steps: 185, turbScale: 2.90, eddyAspect: 3.00, evolve: 0.40, poleTaper: 1.40,
      detailFreq: 5.2, detailAmp: 0.24, detailAniso: 3.20, warpAmt: 0.46, filament: 0.14, hazeAmt: 0.58, hazeFreq: 3.20, hazeAniso: 3.00, hazeThresh: 0.48, hazeSoft: 0.17, hazeColor: '#fbfdff', spots: [],
      smallCount: 9, smallSize: 0.60, smallSpin: 1.60, brightness: 0.02, contrast: 1.04, saturation: 0.94, poleColor: '#e8f4ff', poleAmt: 0.40, eqWarm: 0 } },
};

const hex2rgb = (h) => { h = h.replace('#', ''); return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255]; };
function gradientTex(stops) {
  const N = 1024, data = new Uint8Array(N * 4); const s = [...stops].sort((a, b) => a[0] - b[0]);
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1); let a = s[0], b = s[s.length - 1];
    for (let j = 0; j < s.length - 1; j++) if (t >= s[j][0] && t <= s[j + 1][0]) { a = s[j]; b = s[j + 1]; break; }
    const k = Math.min(1, Math.max(0, (t - a[0]) / Math.max(1e-5, b[0] - a[0]))); const q = k * k * (3 - 2 * k);
    const ca = hex2rgb(a[1]), cb = hex2rgb(b[1]);
    for (let c = 0; c < 3; c++) data[i * 4 + c] = (ca[c] + (cb[c] - ca[c]) * q) * 255; data[i * 4 + 3] = 255;
  }
  const t = new THREE.DataTexture(data, N, 1); t.magFilter = t.minFilter = THREE.LinearFilter; t.needsUpdate = true; return t;
}
function dirFromLonLat(lon, lat) { lon *= Math.PI / 180; lat *= Math.PI / 180; const cl = Math.cos(lat); return [cl * Math.cos(lon), Math.sin(lat), cl * Math.sin(lon)]; }

// Pick & perturb a preset so every giant is its own planet.
export function giantParams(body) {
  const st = body.style || {}; const r = mulberry32(hashStr(body.sys.starId + body.name) + 99);
  let name;
  if (body.sys.real) name = { Jupiter: 'Jupiter', Saturn: 'Saturn', Uranus: 'Uranus', Neptune: 'Neptune' }[body.name];
  if (!name) {
    const cls = body.class; const x = r();
    if (x < 0.04) name = 'Toxic Alien';
    else if (cls === 'hotjupiter') name = 'Brown Dwarf';
    else if (cls === 'icegiant') name = r() < 0.4 ? 'Uranus' : r() < 0.6 ? 'Neptune' : 'Ice Titan';
    else if (cls === 'sudarsky2') name = r() < 0.6 ? 'Pale Giant' : 'Ice Titan';
    else if (cls === 'sudarsky3') name = 'Neptune';
    else name = r() < 0.55 ? 'Jupiter' : r() < 0.6 ? 'Saturn' : 'Pale Giant';
  }
  const pre = GG_PRESETS[name];
  const P = { ...DEF, ...pre.p };
  P.spots = (pre.p.spots || []).map((s) => ({ ...SPOT, ...s }));
  let grad = pre.grad.map((g) => g.slice());
  if (body.sys.real) {
    // real maps: only large-scale jets, gentle turbulence and the storms that really exist
    P.smallCount = 0; P.turb *= 0.45;
    if (body.name === 'Jupiter') P.spots = [{ ...SPOT, lon: -47.5, lat: -20.5, size: 0.075, aspect: 1.6, spin: 2.4 }];
    else if (body.name === 'Neptune') P.spots = [{ ...SPOT, lon: 30, lat: -22, size: 0.05, spin: 2.0 }];
    else P.spots = [];
    P.seed = 3;
  } else {
    P.seed = Math.floor(r() * 1000);
    const j = (k, a) => { P[k] *= 1 + (r() - 0.5) * a; };
    j('bandCount', 0.5); P.bandCount = Math.max(4, Math.round(P.bandCount)); j('zonal', 0.4); j('turb', 0.5); j('turbScale', 0.4); j('eddyAspect', 0.4); j('bandContrast', 0.4); j('detailAmp', 0.4); j('hazeAmt', 0.6); j('flowTime', 0.4);
    // storms: re-roll positions / count
    const n = Math.floor(r() * 5);
    P.spots = [];
    for (let i = 0; i < n; i++) P.spots.push({ ...SPOT, lon: r() * 360 - 180, lat: (r() - 0.5) * 110, size: i === 0 ? 0.08 + r() * 0.12 : 0.03 + r() * 0.07, aspect: 1.3 + r() * 0.8, spin: (r() < 0.5 ? -1 : 1) * (1.4 + r() * 1.6), tint: 0.3 + r() * 0.4, color: grad[Math.floor(r() * grad.length)][1] });
    if (i0(r) < 0.2) { P.spots.unshift({ ...SPOT, lon: r() * 360 - 180, lat: (r() < 0.5 ? -1 : 1) * (15 + r() * 30), size: 0.18 + r() * 0.1, spin: 2.6, tint: 0.65, color: '#' + ['b8412a', '6a2a8a', '2a5ab8', 'e0e0d0'][Math.floor(r() * 4)] }); }
    P.smallCount = Math.floor(r() * 24);
    // its own palette (the presets only lend their flow character), and a much wider spread of band
    // structure, jets, turbulence and haze so no two giants read alike
    // archetype: how the atmosphere is organised, independent of its colour. Jupiter-like: sharp,
    // high-contrast belts and zones with many storms; Saturn-like: many fine, low-contrast bands under a
    // thick haze; Uranus-like: nearly featureless, a few faint bands; Neptune-like: few strong bands, dark spots
    const pick = (tbl) => { let x = r(), acc = 0; for (const [k, w] of tbl) { acc += w; if (x < acc) return k; } return tbl[0][0]; };
    const ARCH = { jovian: [['jupiter', 0.5], ['saturn', 0.4], ['uranus', 0.1]], sudarsky2: [['saturn', 0.5], ['uranus', 0.3], ['jupiter', 0.2]],
      sudarsky3: [['neptune', 0.5], ['uranus', 0.5]], icegiant: [['uranus', 0.5], ['neptune', 0.5]], minineptune: [['uranus', 0.6], ['neptune', 0.4]],
      hotjupiter: [['jupiter', 0.7], ['saturn', 0.3]] };
    const arch = pick(ARCH[body.class] || ARCH.jovian); P.archetype = arch;
    const u = (a, b) => a + (b - a) * r();
    const A = {
      jupiter: { bands: [12, 30], con: [0.45, 0.8], sharp: [1.5, 2.8], turb: [0.5, 1.0], haze: [0.2, 0.45], det: [0.18, 0.32], fil: [0.08, 0.2], small: [8, 24], spots: [1, 4], ramp: 1 },
      saturn:  { bands: [16, 32], con: [0.14, 0.34], sharp: [0.8, 1.4], turb: [0.2, 0.45], haze: [0.5, 0.8], det: [0.08, 0.16], fil: [0.02, 0.07], small: [0, 5], spots: [0, 1], ramp: 0.55 },
      uranus:  { bands: [3, 7], con: [0.03, 0.12], sharp: [0.6, 1.0], turb: [0.08, 0.25], haze: [0.7, 0.9], det: [0.02, 0.06], fil: [0.0, 0.02], small: [0, 2], spots: [0, 0], ramp: 0.16 },
      neptune: { bands: [5, 11], con: [0.4, 0.7], sharp: [1.0, 2.0], turb: [0.4, 0.8], haze: [0.3, 0.5], det: [0.16, 0.28], fil: [0.06, 0.14], small: [3, 8], spots: [1, 2], ramp: 0.8 },
    }[arch];
    if (name !== 'Toxic Alien') grad = proceduralGradient(r, body.class, A.ramp);
    P.bandCount = Math.round(u(...A.bands)); P.bandContrast = u(...A.con); P.bandSharp = u(...A.sharp); P.bandIrreg = u(0.12, 0.45); P.bandWobble = u(0.2, 0.7); P.bandVariety = u(0.08, 0.3) * (A.ramp + 0.3);
    P.zonal = u(0.6, 1.3); P.turb = u(...A.turb); P.turbScale = u(1.6, 3.8); P.eddyAspect = u(1.8, 6.0); P.evolve = u(0.2, 0.55);
    P.detailAmp = u(...A.det); P.detailAniso = u(2.0, 5.0); P.warpAmt = u(0.2, 0.6) * (0.5 + A.ramp * 0.5); P.filament = u(...A.fil); P.wisp = u(0.02, 0.14) * A.ramp;
    P.hazeAmt = u(...A.haze); P.hazeThresh = u(0.44, 0.6); P.hazeAniso = u(2, 5); P.hazeSoft = u(0.1, 0.2);
    P.smallCount = Math.round(u(...A.small));
    const nsp = Math.round(u(A.spots[0], A.spots[1] + 0.49)); P.spots = P.spots.slice(0, nsp);
    if (arch === 'neptune') for (const sp of P.spots) sp.color = '#0b1a38';
    const top = hex2rgb(grad[grad.length - 1][1]), bot = hex2rgb(grad[0][1]);
    const hx = (c) => '#' + c.map(v => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0')).join('');
    P.hazeColor = hx(top.map(v => v * 0.6 + 0.38)); P.poleColor = hx(bot.map((v, i) => v * 0.7 + top[i] * 0.3)); P.poleAmt = u(0.1, 0.5);
    P.eqWarm = body.class === 'jovian' && arch === 'jupiter' ? u(0, 0.4) : u(0, 0.08); P.saturation = u(0.85, 1.15); P.contrast = u(0.95, 1.1);
    if (arch === 'uranus') { P.poleAmt *= 0.4; P.contrast = u(0.88, 0.98); P.wisp = 0; }
    P.smallCol = grad[Math.floor(r() * grad.length)][1];
    for (const sp of P.spots) sp.color = r() < 0.5 ? grad[Math.floor(r() * grad.length)][1] : sp.color;
  }
  return { name, P, grad };
}
const i0 = (r) => r();
// ---------------------------------------------------------------- per-planet palettes
function hsl2hex(h, s, l) {
  h = ((h % 360) + 360) % 360 / 360; const f = (n) => { const k = (n + h * 12) % 12; const a = s * Math.min(l, 1 - l); return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
  return '#' + [f(0), f(8), f(4)].map(v => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0')).join('');
}
// Colour families by cloud chemistry (Sudarsky classes): ammonia decks are cream/tan/brown with rusty
// belts, water-cloud giants bright white-grey, cloudless ones azure, hot ones dark maroon/charcoal,
// ice giants cyan to deep blue. Each planet draws its own hue, saturation and lightness ramp.
const FAMILIES = {
  jovian:      { hue: [22, 42], sat: [0.18, 0.42], lo: [0.2, 0.36], hi: [0.86, 0.95], accents: [[12, 0.55], [35, 0.35], [200, 0.12], [48, 0.4]] },
  sudarsky2:   { hue: [200, 230], sat: [0.05, 0.18], lo: [0.45, 0.62], hi: [0.92, 0.98], accents: [[40, 0.12], [210, 0.2]] },
  sudarsky3:   { hue: [205, 225], sat: [0.45, 0.7], lo: [0.18, 0.3], hi: [0.7, 0.85], accents: [[190, 0.4], [240, 0.35]] },
  hotjupiter:  { hue: [0, 22], sat: [0.25, 0.55], lo: [0.06, 0.12], hi: [0.4, 0.58], accents: [[30, 0.6], [340, 0.3], [0, 0.0]] },
  icegiant:    { hue: [175, 225], sat: [0.3, 0.6], lo: [0.2, 0.4], hi: [0.82, 0.93], accents: [[160, 0.3], [230, 0.45], [195, 0.15]] },
  minineptune: { hue: [150, 215], sat: [0.12, 0.35], lo: [0.4, 0.55], hi: [0.86, 0.94], accents: [[45, 0.15], [260, 0.18]] },
};
function proceduralGradient(r, cls, ramp = 1) {
  const F = FAMILIES[cls] || FAMILIES.jovian;
  const rr = (a) => a[0] + (a[1] - a[0]) * r();
  const hue = rr(F.hue), sat = rr(F.sat) * (0.6 + 0.4 * ramp), hi = rr(F.hi), lo = hi - (hi - rr(F.lo)) * ramp; // hazy archetypes have a narrow, soft range
  const n = 6 + Math.floor(r() * 4), stops = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    let h = hue + (r() - 0.5) * 18 + (t - 0.5) * (r() - 0.5) * 30, sa = sat * (0.7 + 0.6 * r()) * (1 - 0.5 * Math.pow(t, 3)), l = lo + (hi - lo) * Math.pow(t, 0.8 + r() * 0.5);
    if (i > 0 && i < n - 1 && r() < 0.28) { const a = F.accents[Math.floor(r() * F.accents.length)]; h = a[0] + (r() - 0.5) * 16; sa = a[1] * (0.7 + 0.6 * r()); }
    stops.push([t, hsl2hex(h, Math.min(1, sa), Math.min(0.97, l))]);
  }
  return stops;
}

export class GasGiantBaker {
  constructor(renderer) {
    this.r = renderer;
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2)); this.quad.frustumCulled = false;
    this.scene = new THREE.Scene(); this.scene.add(this.quad);
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const mk = (fs) => new THREE.RawShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: VS, fragmentShader: fs, uniforms: {}, depthTest: false, depthWrite: false });
    this.bakeMat = mk(BAKE_FS); this.shadeMat = mk(SHADE_FS);
    this.jobs = []; this.cache = new Map();
  }
  // returns {albedo: Texture|null (null for real planets), flow: Texture, ready: bool}
  request(body) {
    const key = body.sys.starId + '/' + body.name;
    let e = this.cache.get(key); if (e) return e;
    const { P, grad, name } = giantParams(body);
    const W = IS_MOBILE ? 1024 : 2048, H = W / 2;
    const withAlbedo = !body.sys.real;
    e = { ready: false, flow: null, albedo: null, P, preset: name, key, W, H, withAlbedo, stage: 0, row: 0 };
    this.cache.set(key, e); this.jobs.push(e);
    e.grad = gradientTex(grad);
    return e;
  }
  setField(u, P, phase) {
    const U = (k, v) => { u[k] = { value: v }; };
    U('uSeed', P.seed * 0.01); U('uZonal', P.zonal); U('uTurb', P.turb); U('uTurbScale', P.turbScale); U('uEddyAspect', P.eddyAspect); U('uPoleTaper', P.poleTaper); U('uTurbOct', Math.round(P.turbOct));
    U('uBandCount', P.bandCount); U('uBandIrreg', P.bandIrreg); U('uBandAsym', P.bandAsym); U('uPhase', phase);
    const n = Math.min(P.spots.length, MAX_SPOTS); const pos = [], shape = [], tint = [];
    for (let i = 0; i < MAX_SPOTS; i++) {
      const s = P.spots[i];
      if (s && i < n) { const d = dirFromLonLat(s.lon, s.lat); pos.push(new THREE.Vector4(d[0], d[1], d[2], s.size * Math.PI)); shape.push(new THREE.Vector4(s.aspect, s.spin, s.detail, s.on ? 1 : 0)); const c = hex2rgb(s.color); tint.push(new THREE.Vector4(c[0], c[1], c[2], s.tint)); }
      else { pos.push(new THREE.Vector4()); shape.push(new THREE.Vector4()); tint.push(new THREE.Vector4()); }
    }
    U('uSpotCount', n); U('uSpotPos', pos); U('uSpotShape', shape); U('uSpotTint', tint);
    U('uSmallCount', Math.round(P.smallCount)); U('uSmallSpin', P.smallSpin); U('uSmallSize', P.smallSize);
  }
  pass(mat, rt, rows) {
    this.quad.material = mat;
    const prev = this.r.getRenderTarget(), prevAuto = this.r.autoClear;
    if (rows) { rt.scissor.set(0, rows[0], rt.width, rows[1]); rt.scissorTest = true; rt.viewport.set(0, 0, rt.width, rt.height); } else rt.scissorTest = false;
    this.r.autoClear = false; this.r.setRenderTarget(rt); this.r.render(this.scene, this.cam); this.r.setRenderTarget(prev); this.r.autoClear = prevAuto;
    rt.scissorTest = false;
  }
  // Do a bounded amount of work; call once per frame.
  step() {
    const e = this.jobs[0]; if (!e) return false;
    const P = e.P;
    if (e.stage === 0) { // wind field (two phases) + flow map
      const opt = { type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, wrapS: THREE.RepeatWrapping, depthBuffer: false };
      e.v0 = new THREE.WebGLRenderTarget(2048, 1024, opt); e.v1 = new THREE.WebGLRenderTarget(2048, 1024, opt);
      e.flowRT = new THREE.WebGLRenderTarget(1024, 512, { ...opt });
      const u = {}; this.setField(u, P, 0); u.uMode = { value: 0 }; this.bakeMat.uniforms = u; this.bakeMat.needsUpdate = true;
      this.pass(this.bakeMat, e.v0); u.uPhase.value = 1; this.pass(this.bakeMat, e.v1);
      u.uPhase.value = 0; u.uMode.value = 1; this.pass(this.bakeMat, e.flowRT);
      e.flow = e.flowRT.texture; e.stage = e.withAlbedo ? 1 : 2;
      if (!e.withAlbedo) { e.v0.dispose(); e.v1.dispose(); e.ready = true; this.jobs.shift(); }
      return true;
    }
    if (e.stage === 1) { // shade strips
      if (!e.albRT) {
        e.albRT = new THREE.WebGLRenderTarget(e.W, e.H, { type: THREE.UnsignedByteType, format: THREE.RGBAFormat, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, wrapS: THREE.RepeatWrapping, generateMipmaps: true, depthBuffer: false, colorSpace: THREE.SRGBColorSpace });
        e.albRT.texture.anisotropy = 8;
        const u = {}; this.setField(u, P, 0);
        const U = (k, v) => { u[k] = { value: v }; };
        U('uV0', e.v0.texture); U('uV1', e.v1.texture); U('uGradient', e.grad);
        U('uFlowTime', P.flowTime); U('uSteps', Math.min(MAX_STEPS, Math.round(P.steps * (IS_MOBILE ? 0.6 : 1)))); U('uEvolve', P.evolve);
        for (const k of ['bandContrast', 'bandVariety', 'bandSharp', 'bandWobble', 'taperBands', 'taperDetail', 'taperHaze', 'detailFreq', 'detailAmp', 'detailAniso', 'filament', 'warpAmt', 'wisp', 'hazeAmt', 'hazeFreq', 'hazeThresh', 'hazeSoft', 'hazeAniso', 'smallTint', 'poleAmt', 'eqWarm', 'brightness', 'contrast', 'saturation', 'gamma'])
          U('u' + k[0].toUpperCase() + k.slice(1), P[k]);
        U('uOct', Math.round(P.octaves)); U('uHazeColor', new THREE.Vector3(...hex2rgb(P.hazeColor))); U('uSmallCol', new THREE.Vector3(...hex2rgb(P.smallCol))); U('uPoleColor', new THREE.Vector3(...hex2rgb(P.poleColor)));
        this.shadeMat.uniforms = u; this.shadeMat.needsUpdate = true;
        e.row = 0;
      } else if (this.shadeMat.uniforms.uV0.value !== e.v0.texture) {
        this.shadeMat.uniforms.uV0.value = e.v0.texture; this.shadeMat.uniforms.uV1.value = e.v1.texture; this.shadeMat.uniforms.uGradient.value = e.grad;
      }
      const rows = IS_MOBILE ? 32 : 64;
      this.pass(this.shadeMat, e.albRT, [e.row, rows]);
      e.row += rows;
      if (e.row >= e.H) {
        e.albedo = e.albRT.texture;
        e.v0.dispose(); e.v1.dispose(); e.ready = true; this.jobs.shift();
      }
      return true;
    }
    return false;
  }

}
