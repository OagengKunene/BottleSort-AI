import assert from 'node:assert/strict';
import fs from 'node:fs';
import {image,predict,route} from '../dist/engine.js';
const model = JSON.parse(fs.readFileSync(new URL('../dist/model.json',import.meta.url)));
const fixtures = JSON.parse(fs.readFileSync(new URL('./renderer_fixtures.json',import.meta.url)));
let maxPixelError=0,maxProbabilityError=0;
for(const fixture of fixtures){
  const pixels=image(fixture.label,fixture.seed,fixture.difficulty);
  pixels.forEach((p,i)=>{maxPixelError=Math.max(maxPixelError,Math.abs(p-fixture.pixels[i]));});
  const result=predict(pixels,model);
  result.probabilities.forEach((p,i)=>{maxProbabilityError=Math.max(maxProbabilityError,Math.abs(p-fixture.probabilities[i]));});
  assert.equal(result.predicted,fixture.predicted);
  assert.ok(Math.abs(result.probabilities.reduce((a,b)=>a+b)-1)<1e-12);
}
assert.ok(maxPixelError<1e-12,`Renderer mismatch: ${maxPixelError}`);
assert.ok(maxProbabilityError<1e-8,`Inference mismatch: ${maxProbabilityError}`);
const matrix=Array.from({length:3},()=>[0,0,0]);
for(let c=0;c<3;c++)for(let k=0;k<140;k++){
  const result=predict(image(c,900001+c*100000+k,.15*(k%4)),model);
  matrix[c][result.predicted]++;
}
assert.deepEqual(matrix,model.report.confusion_matrix);
assert.equal(route({predicted:0,confidence:.84},.85),'review');
assert.equal(route({predicted:0,confidence:.85},.85),'accept');
assert.equal(route({predicted:1,confidence:.95},.85),'reject');
assert.equal(route({predicted:2,confidence:.99},.85),'reject');
let reviews=0;
for(let c=0;c<3;c++)for(let k=0;k<60;k++)if(route(predict(image(c,7000001+c*1000+k,1),model),.99)==='review')reviews++;
assert.ok(reviews>0,'Optical stress should produce review candidates');
console.log(JSON.stringify({renderer_fixtures:fixtures.length,maxPixelError,maxProbabilityError,browser_confusion_matrix:matrix,held_out_images:420,routing_assertions:4,stress_review_candidates:reviews,passed:true},null,2));
