import assert from 'node:assert/strict';
import {SoftBodyMotion} from './physics.js';
let body=new SoftBodyMotion();body.drop(3);
body.step(1/120);assert.ok(body.position[1]<3 && body.velocity[1]<0,'Drop starts in free fall');
let impacts=[];
for(let i=0;i<1200;i++){body.step(1/120);assert.ok(body.position[1]>=0,'No floor penetration');if(body.lastImpact>.3)impacts.push(body.lastImpact)}
assert.ok(impacts.length>=2,'Drop bounces');assert.ok(impacts[1]<impacts[0],'Collision dissipates energy');assert.ok(body.position[1]<.01 && Math.abs(body.velocity[1])<.01,'Body settles');
body.reset();for(let i=0;i<240;i++)body.step(1/120,{grab:[0,2,0]});assert.ok(body.position[1]>1.7,'Default stiffness lifts the whole object');
for(let i=0;i<1200;i++)body.step(1/120);assert.ok(body.position[1]<.01,'Released body falls and settles');
body.drop(2);assert.deepEqual(body.velocity,[0,0,0]);assert.equal(body.position[1],2);
console.log('PASS: free fall, nonpenetration, rebound energy loss, settling, default grab lift, release, reset');
