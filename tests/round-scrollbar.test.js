import test from 'node:test';
import assert from 'node:assert/strict';
import {arcScrollMetrics} from '../public/round-scrollbar.js';
test('quarter-circle thumb spans visible fraction and clamps at both ends',()=>{
 assert.equal(arcScrollMetrics(0,300,300),null);
 assert.equal(arcScrollMetrics(0,300,0),null);
 const top=arcScrollMetrics(0,1200,300),middle=arcScrollMetrics(450,1200,300),bottom=arcScrollMetrics(900,1200,300);
 assert.equal(top.length,6.25);assert.equal(top.offset,0);
 assert.equal(middle.offset,-9.375);assert.equal(bottom.offset,-18.75);
 assert.deepEqual(arcScrollMetrics(990,1200,300),bottom);
 assert.equal(arcScrollMetrics(0,1e6,300).length,3);
});
