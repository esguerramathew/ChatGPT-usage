import test from 'node:test';import assert from 'node:assert/strict';import {nextReset,dueSlot,PERIOD} from '../schedule.js';
test('future anchor is preserved',()=>{assert.equal(nextReset(1000,500),1000);assert.equal(dueSlot(1000,500),null);});
test('boundary advances exactly five hours',()=>{assert.equal(dueSlot(1000,1000),1000);assert.equal(nextReset(1000,1000),1000+PERIOD);});
test('late notifications cannot drift the schedule',()=>{assert.equal(nextReset(1000,1000+PERIOD+97000),1000+2*PERIOD);});
test('outages skip old periods while preserving anchor',()=>{assert.equal(dueSlot(1000,1000+8*PERIOD+15000),1000+8*PERIOD);assert.equal(nextReset(1000,1000+8*PERIOD+15000),1000+9*PERIOD);});
