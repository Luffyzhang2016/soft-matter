import assert from 'node:assert/strict';
import {makeShape} from './shapes.js';
import {SoftBodyMotion} from './physics.js';
for(const name of ['ghost','watermelon','bear','star']){
  const {geometry,face}=makeShape(name),a=geometry.attributes.position.array,ix=geometry.index.array;let volume=0;
  geometry.computeBoundingBox();
  const bounds=geometry.boundingBox,depth=bounds.max.z-bounds.min.z,width=bounds.max.x-bounds.min.x;
  if(name==='ghost')assert.ok(depth/width>.85,'Ghost has spherical depth');
  if(name==='bear'){assert.equal(face.length,0,'Bear has no facial dots');assert.ok(depth/width>.6,'Bear has a rounded body');}
  for(let i=0;i<ix.length;i+=3){const p=ix[i]*3,q=ix[i+1]*3,r=ix[i+2]*3;volume+=(a[p]*(a[q+1]*a[r+2]-a[q+2]*a[r+1])+a[p+1]*(a[q+2]*a[r]-a[q]*a[r+2])+a[p+2]*(a[q]*a[r+1]-a[q+1]*a[r]))/6}
  assert.ok(volume>0,`${name}: outward faces`);assert.ok(a.every(Number.isFinite));
  const body=new SoftBodyMotion();body.setShape(a);body.drop(2.8);
  for(let i=0;i<1200;i++)body.step(1/120);
  assert.ok(body.position.every(Number.isFinite),`${name}: stable drop`);
  assert.ok(Math.abs(body.velocity[1])<.2,`${name}: settles, vy=${body.velocity[1]}`);
  geometry.dispose();
}
const {geometry}=makeShape('star');
function lift(x){const body=new SoftBodyMotion();body.setShape(geometry.attributes.position.array);for(let i=0;i<180;i++)body.step(1/120,{grab:{local:[x,1.5,.5],target:[x,3.8,.5]}});return body}
const left=lift(-1.3),right=lift(1.3);
assert.ok(left.position[1]>.5 && right.position[1]>.5,'Off-center grabs lift');
assert.ok(Math.abs(left.rotation.z)>.1,'Off-center grab rotates');
assert.ok(left.rotation.z*right.rotation.z<0,'Opposite sides rotate opposite directions');
console.log('PASS: four outward meshes, stable drops, settling, point-grab lift and opposite torque');


