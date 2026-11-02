import test from 'node:test';
import assert from 'node:assert/strict';
import { canAccessPath, getDefaultModuleAccess, mergeModuleOverrides } from '../../src/lib/auth/module-permissions';

test('Rutas is protected for visitors even through a direct nested URL', () => {
  const visitor = mergeModuleOverrides(getDefaultModuleAccess('operator'), {inventory:true, ventas:false});
  assert.equal(canAccessPath('/rutas/centro', visitor), false);
  assert.equal(canAccessPath('/rutas/jobs/123', visitor), false);
  assert.equal(canAccessPath('/inventory', visitor), true);
});

test('admins and explicit module grants can access Rutas', () => {
  assert.equal(canAccessPath('/rutas/centro', getDefaultModuleAccess('admin')), true);
  assert.equal(canAccessPath('/rutas/centro', mergeModuleOverrides(getDefaultModuleAccess('operator'), {rutas:true})), true);
});
