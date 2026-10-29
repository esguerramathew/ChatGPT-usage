import test from 'node:test';
import assert from 'node:assert/strict';
import {sortedAccounts,validAccountDetails} from '../public/accounts.js';
test('sorts soonest resets first, reorders after rollover, and keeps paused accounts last',()=>{
  const rows=[{id:'later',name:'Work',anchor:9000,paused:false},{id:'paused',name:'Paused',anchor:1500,paused:true},{id:'soon',name:'Personal',anchor:2000,paused:false}];
  assert.deepEqual(sortedAccounts(rows,1000).map(r=>r.id),['soon','later','paused']);
  assert.deepEqual(sortedAccounts(rows,2001).map(r=>r.id),['later','soon','paused']);
  assert.equal(rows[0].id,'later');
});
test('accepts legacy accounts and optional labels, rejects malformed metadata',()=>{
  assert.equal(validAccountDetails({}),true);
  assert.equal(validAccountDetails({email:'',color:'blue'}),true);
  assert.equal(validAccountDetails({email:'person+work@example.com',color:'green'}),true);
  assert.equal(validAccountDetails({email:'not-an-email'}),false);
  assert.equal(validAccountDetails({color:'url(evil)'}),false);
});
