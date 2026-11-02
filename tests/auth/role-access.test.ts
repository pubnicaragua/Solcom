import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveRoleAccess } from '../../src/hooks/useRoleAccess';

test('granular read and write permissions do not grant unrelated actions',()=>{
 const read=resolveRoleAccess('operator',['inventory.read'],'inventory');
 assert.equal(read.can_view,true);assert.equal(read.can_edit,false);assert.equal(read.can_delete,false);
 const write=resolveRoleAccess('operator',['inventory.write'],'inventory');
 assert.equal(write.can_create,true);assert.equal(write.can_edit,true);assert.equal(write.can_delete,false);
 assert.equal(resolveRoleAccess('operator',['reports.read'],'inventory').can_view,false);
});

test('admin has all actions; an unresolved role has none',()=>{
 assert.ok(Object.values(resolveRoleAccess('admin',[],'inventory')).every(Boolean));
 assert.ok(Object.values(resolveRoleAccess('operator',[],'inventory')).every(value=>!value));
});
