import * as T from './vendor/three.module.js';
import { HDRLoader } from './vendor/HDRLoader.js';
import { SoftBodyMotion } from './physics.js';
import { makeShape } from './shapes.js';

const $=id=>document.getElementById(id),stage=$('stage');
const renderer=new T.WebGLRenderer({antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=.95;stage.append(renderer.domElement);
const scene=new T.Scene();scene.background=new T.Color('#d4d3ca');scene.fog=new T.Fog('#d4d3ca',18,45);
const camera=new T.PerspectiveCamera(35,1,.1,100);
scene.add(new T.HemisphereLight(0xffffff,0x727561,.8));
const sun=new T.DirectionalLight(0xffffff,2);sun.position.set(-3,7,4);scene.add(sun);
const ground=new T.Mesh(new T.PlaneGeometry(200,200),new T.MeshStandardMaterial({color:'#d2d0bf',roughness:.95,envMapIntensity:0}));ground.rotation.x=-Math.PI/2;scene.add(ground);
const material=new T.MeshPhysicalMaterial({color:0xffffff,roughness:.012,transmission:1,thickness:.85,ior:1.45,clearcoat:.35,clearcoatRoughness:.015,attenuationColor:'#ed0056',attenuationDistance:1.2,envMapIntensity:1.1});
const settings={elasticity:50,damping:35,glass:100,angle:42};
const hdriAngle={value:0};
const watermelon={value:1};
const pmrem=new T.PMREMGenerator(renderer);
new HDRLoader().load('./assets/pav_studio_03_2k.hdr',hdr=>{
  hdr.mapping=T.EquirectangularReflectionMapping;scene.environment=pmrem.fromEquirectangular(hdr).texture;
  material.onBeforeCompile=shader=>{
    shader.uniforms.studioHDR={value:hdr};shader.uniforms.hdriAngle=hdriAngle;shader.uniforms.watermelon=watermelon;
    shader.vertexShader='attribute vec3 fruitRest; varying vec3 vFruit;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvFruit=fruitRest;');
    shader.fragmentShader='uniform sampler2D studioHDR;\nuniform float hdriAngle;\nuniform float watermelon;\nvarying vec3 vFruit;\n'+shader.fragmentShader;
    const transmission=T.ShaderChunk.transmission_fragment.replace('material.attenuationColor = attenuationColor;',`
      material.attenuationColor = attenuationColor;
      if(watermelon>.5 && watermelon<1.5){
        float h=vFruit.y-.19*pow(vFruit.x/1.7,2.);
        float bands=vFruit.x*5.8+sin(vFruit.z*3.2+vFruit.y*2.1)*1.15+sin(vFruit.x*12.+vFruit.z*7.)*.17;
        float stripe=.5+.5*sin(bands);
        vec3 rind=mix(vec3(.006,.095,.012),vec3(.21,.59,.025),smoothstep(.32,.62,stripe));
        vec3 flesh=mix(vec3(.96,.9,.012),attenuationColor,smoothstep(.66,1.63,h));
        material.attenuationColor=mix(rind,flesh,smoothstep(.46,.55,h));
        material.transmission*=mix(.52,1.,smoothstep(.46,.55,h));
        material.attenuationDistance=mix(.45,1.5,smoothstep(.46,.55,h));
        totalDiffuse=mix(rind*.42,totalDiffuse,smoothstep(.46,.55,h));
      }
      if(watermelon>1.5 && watermelon<2.5){
        float face=1.-smoothstep(.78,1.,length((vFruit.xy-vec2(0.,1.3))/vec2(.98,1.05)));
        material.attenuationColor=mix(mix(attenuationColor,vec3(1.),.12),attenuationColor*.55,face);
        material.attenuationDistance=1.35;
        material.transmission*=1.;
      }
      if(watermelon>2.5){
        material.attenuationDistance=1.5;
      }
    `).replace('totalDiffuse = mix( totalDiffuse, transmitted.rgb, material.transmission );',`
      vec3 through = refract(-v, n, 1.0 / material.ior);
      through.xz = mat2(cos(hdriAngle),-sin(hdriAngle),sin(hdriAngle),cos(hdriAngle)) * through.xz;
      vec2 studioUV = vec2(atan(through.z,through.x)*RECIPROCAL_PI2+.5,asin(clamp(through.y,-1.0,1.0))*RECIPROCAL_PI+.5);
      vec3 room = texture2D(studioHDR,studioUV).rgb;
      vec3 tint = pow(material.attenuationColor,vec3(material.thickness/material.attenuationDistance));
      vec3 volume = mix(transmitted.rgb,room*tint,.58);
      totalDiffuse = mix(totalDiffuse,volume,material.transmission);
    `);
    shader.fragmentShader=shader.fragmentShader.replace('#include <transmission_fragment>',transmission);
  };material.needsUpdate=true;
},undefined,()=>{$('hint').textContent='环境贴图加载失败，请刷新重试。'});

// Translucent contact and a tinted transmitted-light lobe, not opaque shadows.
// This real-time footprint approximation is not ray-traced caustics.
const shadowMaterial=new T.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{tint:{value:new T.Color('#ed0056')},height:{value:0},glass:{value:1}},vertexShader:'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:`
  varying vec2 vUv;uniform vec3 tint;uniform float height;uniform float glass;
  void main(){vec2 q=(vUv-.5)*2.;float r=length(q);float contact=exp(-r*r*4.5);float rim=exp(-pow((r-.58)*6.,2.));float strength=exp(-height*.7);vec3 c=mix(vec3(.17,.18,.14),tint,.35*glass);gl_FragColor=vec4(c,(contact*(.21-.14*glass)+rim*.09*glass)*strength);}
`});
const shadow=new T.Mesh(new T.PlaneGeometry(1,1),shadowMaterial);shadow.rotation.x=-Math.PI/2;shadow.position.y=.012;scene.add(shadow);
const causticMaterial=new T.ShaderMaterial({transparent:true,depthWrite:false,blending:T.AdditiveBlending,uniforms:{tint:shadowMaterial.uniforms.tint,height:shadowMaterial.uniforms.height,glass:shadowMaterial.uniforms.glass},vertexShader:shadowMaterial.vertexShader,fragmentShader:`
 varying vec2 vUv;uniform vec3 tint;uniform float height;uniform float glass;
 void main(){vec2 q=(vUv-.5)*2.;float r=length(q*vec2(1.,1.2));float ring=exp(-pow((r-.53)*12.,2.));float core=exp(-dot(q,q)*10.);float a=(ring*.025+core*.16)*exp(-height*.9)*glass;gl_FragColor=vec4(mix(tint,vec3(1.),.38),a);}
`});
const caustic=new T.Mesh(new T.PlaneGeometry(1,1),causticMaterial);caustic.rotation.x=-Math.PI/2;caustic.position.y=.018;scene.add(caustic);

const body=new SoftBodyMotion(),jelly=new T.Mesh(new T.BufferGeometry(),material);scene.add(jelly);
let geometry,positions,rest,localVelocity,seams,details=[],shapeWidth=3,shapeDepth=2;
const p=new T.Vector3(),sum=new T.Vector3(),displacement=new T.Vector3();
const detailMaterial=new T.MeshPhysicalMaterial({color:'#39252e',roughness:.12,metalness:0,clearcoat:1});
const blushMaterial=new T.MeshBasicMaterial({color:'#f2b84b'}),shineMaterial=new T.MeshBasicMaterial({color:'#ffffff'});
const ghostMaterials=[detailMaterial,detailMaterial,blushMaterial,blushMaterial,shineMaterial];
function loadShape(name){
  release();body.reset();geometry?.dispose();for(const d of details){scene.remove(d.mesh);d.mesh.geometry.dispose()}details=[];
  const made=makeShape(name);geometry=made.geometry;jelly.geometry=geometry;positions=geometry.attributes.position;rest=positions.array.slice();body.setShape(rest);localVelocity=new Float32Array(rest.length);
  geometry.setAttribute('fruitRest',new T.BufferAttribute(rest.slice(),3));watermelon.value=name==='watermelon'?1:name==='ghost'?2:name==='bear'?3:0;
  geometry.computeBoundingBox();const size=geometry.boundingBox.getSize(new T.Vector3());shapeWidth=size.x;shapeDepth=size.z;
  const coincident=new Map();for(let i=0;i<positions.count;i++){const key=[rest[i*3],rest[i*3+1],rest[i*3+2]].map(v=>Math.round(v*10000)).join(',');if(!coincident.has(key))coincident.set(key,[]);coincident.get(key).push(i)}seams=[...coincident.values()].filter(g=>g.length>1);
  for(const [x,y,z,r] of made.face){const mesh=new T.Mesh(new T.SphereGeometry(r,16,10),name==='ghost'?ghostMaterials[Math.min(details.length,4)]:detailMaterial);mesh.scale.set(name==='ghost'&&details.length>=2&&details.length<4?1.4:1,name==='watermelon'?1.75:name==='ghost'&&details.length<2?1.65:1,.55);const tilt=name==='watermelon'?(x>0?-.45:.35):0;mesh.geometry.rotateZ(tilt);scene.add(mesh);let closest=0,best=Infinity;for(let i=0;i<positions.count;i++){const dist=(rest[i*3]-x)**2+(rest[i*3+1]-y)**2+(rest[i*3+2]-z)**2;if(dist<best){best=dist;closest=i}}details.push({mesh,point:new T.Vector3(x,y,z),closest})}
  updateNormals();$('shape').value=name;
  resume();
}
function updateNormals(){geometry.computeVertexNormals();const normal=geometry.attributes.normal;for(const group of seams){sum.set(0,0,0);for(const i of group)sum.add(p.fromBufferAttribute(normal,i));sum.normalize();for(const i of group)normal.setXYZ(i,sum.x,sum.y,sum.z)}normal.needsUpdate=true}

const ray=new T.Raycaster(),pointer=new T.Vector2(),plane=new T.Plane(),hit=new T.Vector3(),target=new T.Vector3(),grabLocal=new T.Vector3();
const cursor=new T.Mesh(new T.SphereGeometry(.04,12,8),new T.MeshBasicMaterial({color:'#ff704d'}));cursor.visible=false;scene.add(cursor);
let dragging=false,paused=false,selected=0,activePointer=null;
function resume(){paused=false;$('pause').textContent='暂停'}
function aim(e){const rect=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);ray.setFromCamera(pointer,camera)}
renderer.domElement.addEventListener('pointerdown',e=>{aim(e);const hits=ray.intersectObject(jelly);if(!hits.length)return;resume();dragging=true;activePointer=e.pointerId;renderer.domElement.setPointerCapture(e.pointerId);target.copy(hits[0].point);grabLocal.copy(target);jelly.worldToLocal(grabLocal);let nearest=Infinity;for(let i=0;i<positions.count;i++){const d=p.fromBufferAttribute(positions,i).distanceToSquared(grabLocal);if(d<nearest){nearest=d;selected=i}}grabLocal.fromArray(rest,selected*3);plane.setFromNormalAndCoplanarPoint(camera.getWorldDirection(new T.Vector3()),target);cursor.visible=true;cursor.position.copy(target);stage.style.cursor='grabbing';$('hint').textContent='可以整块拎起 · 松手自由落下';});
renderer.domElement.addEventListener('pointermove',e=>{aim(e);if(dragging){if(ray.ray.intersectPlane(plane,hit)){target.copy(hit);target.x=T.MathUtils.clamp(target.x,-4,4);target.y=T.MathUtils.clamp(target.y,.1,5);target.z=T.MathUtils.clamp(target.z,-2,3);cursor.position.copy(target)}}else stage.style.cursor=ray.intersectObject(jelly).length?'grab':'default'});
function release(){dragging=false;cursor.visible=false;stage.style.cursor='default';$('hint').textContent='拖住果冻，拎起，然后松手。';if(activePointer!==null && renderer.domElement.hasPointerCapture(activePointer))renderer.domElement.releasePointerCapture(activePointer);activePointer=null}
for(const event of ['pointerup','pointercancel','lostpointercapture'])renderer.domElement.addEventListener(event,release);
addEventListener('blur',release);
function drop(){release();resume();body.drop(2.1);positions.array.set(rest);localVelocity.fill(0)}
renderer.domElement.addEventListener('dblclick',drop);$('bounce').onclick=drop;
function updateMaterial(){material.transmission=settings.glass/100;material.roughness=.012+(1-material.transmission)*.2;material.color.copy(material.attenuationColor).lerp(new T.Color(0xffffff),material.transmission);shadowMaterial.uniforms.glass.value=material.transmission;hdriAngle.value=settings.angle*Math.PI/180;scene.environmentRotation.y=hdriAngle.value}
function color(value){material.attenuationColor.set(value).lerp(new T.Color(0xffffff),.002);shadowMaterial.uniforms.tint.value.set(value);$('color').value=value;document.querySelectorAll('[data-color]').forEach(b=>b.classList.toggle('selected',b.dataset.color===value));updateMaterial()}
document.querySelectorAll('[data-color]').forEach(b=>b.onclick=()=>{color(b.dataset.color);$('colorName').textContent=b.getAttribute('aria-label')});$('color').oninput=e=>{color(e.target.value);$('colorName').textContent='自定义'};
for(const name of Object.keys(settings))$(name).oninput=e=>{settings[name]=+e.target.value;$(name+'Value').value=e.target.value+(name==='angle'?'°':'');updateMaterial()};
$('shape').onchange=e=>loadShape(e.target.value);
$('pause').onclick=e=>{paused=!paused;e.target.textContent=paused?'继续':'暂停'};
$('reset').onclick=()=>{release();body.reset();positions.array.set(rest);localVelocity.fill(0);for(const [k,v] of Object.entries({elasticity:50,damping:35,glass:100,angle:42})){settings[k]=v;$(k).value=v;$(k+'Value').value=v+(k==='angle'?'°':'')}color('#ed0056');$('colorName').textContent='覆盆子';resume()};
function resize(){const w=innerWidth,h=innerHeight;renderer.setSize(w,h);camera.aspect=w/h;const mobile=w<600,distance=mobile?14.5:12.5;renderer.toneMappingExposure=mobile?1.05:.95;sun.intensity=mobile?1.7:2;material.thickness=mobile?.65:.85;material.envMapIntensity=mobile?1.2:1.1;camera.position.set(0,1.15+distance*Math.tan(18*Math.PI/180),distance);camera.lookAt(0,mobile?.72:1.15,0);camera.clearViewOffset();if(w>=600&&w<1000)camera.setViewOffset(w,h,w*.065,0,w,h);camera.updateProjectionMatrix()}
addEventListener('resize',resize);resize();loadShape('ghost');color('#ff243e');

function step(dt){
  const desired=dragging?{target:target.toArray(),local:grabLocal.toArray()}:null;
  body.step(dt,{...settings,grab:desired});
  const spring=65+settings.elasticity*1.4,dragDamping=5+settings.damping*.16;
  const scaleY=1-body.squash,scaleXZ=1/Math.sqrt(scaleY);
  if(dragging){displacement.copy(target).sub(new T.Vector3().fromArray(body.position)).sub(body.center).applyQuaternion(body.rotation.clone().invert()).add(body.center).sub(grabLocal)}else displacement.set(0,0,0);
  const a=positions.array;
  for(let i=0;i<positions.count;i++){
    const n=i*3,dist=(rest[n]-grabLocal.x)**2+(rest[n+1]-grabLocal.y)**2+(rest[n+2]-grabLocal.z)**2,influence=dragging?Math.exp(-dist/.7):0;
    for(let c=0;c<3;c++){const j=n+c,desired=rest[j]*(c===1?scaleY:scaleXZ)+displacement.getComponent(c)*influence;localVelocity[j]+=((desired-a[j])*spring-localVelocity[j]*dragDamping)*dt;a[j]+=localVelocity[j]*dt}
    p.fromArray(a,n).sub(body.center).applyQuaternion(body.rotation).add(body.center);
    const worldY=p.y+body.position[1];
    if(worldY<.02){sum.set(0,.02-worldY,0).applyQuaternion(body.rotation.clone().invert());a[n]+=sum.x;a[n+1]+=sum.y;a[n+2]+=sum.z;localVelocity[n]*=.6;localVelocity[n+1]*=.6;localVelocity[n+2]*=.6}
  }
}
let accumulated=0;const clock=new T.Clock();
function animate(){requestAnimationFrame(animate);accumulated+=Math.min(clock.getDelta(),.05);if(!paused){while(accumulated>=1/120){step(1/120);accumulated-=1/120}positions.needsUpdate=true;updateNormals()}else accumulated=0;
  jelly.quaternion.copy(body.rotation);jelly.position.fromArray(body.position).add(body.center).sub(p.copy(body.center).applyQuaternion(body.rotation));jelly.updateMatrixWorld(true);
  for(const d of details){const n=d.closest*3;d.mesh.position.copy(d.point);d.mesh.position.x+=positions.array[n]-rest[n];d.mesh.position.y+=positions.array[n+1]-rest[n+1];d.mesh.position.z+=positions.array[n+2]-rest[n+2];jelly.localToWorld(d.mesh.position);d.mesh.quaternion.copy(body.rotation)}
  const height=body.lowest,spread=1+height*.15;shadowMaterial.uniforms.height.value=height;
  shadow.position.set(body.position[0]+height*.22,.012,body.position[2]-.1);shadow.scale.set(shapeWidth*1.35*spread,shapeDepth*1.8*spread,1);
  caustic.position.set(body.position[0]+.35+height*.15,.018,body.position[2]-.3);caustic.scale.set(shapeWidth*1.15,shapeDepth*1.4,1);
  stage.dataset.height=height.toFixed(3);stage.dataset.dragging=String(dragging);stage.dataset.rotation=body.rotation.toArray().map(v=>v.toFixed(3)).join(",");
  renderer.render(scene,camera);
}animate();











