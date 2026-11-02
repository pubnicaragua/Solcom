import test from 'node:test';
import assert from 'node:assert/strict';
import { subscribeToRole } from '../../src/lib/auth/user-role-loader';

async function until(predicate: () => boolean) {
  const deadline = Date.now() + 2000;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('Expected permission state did not settle');
    await new Promise(resolve => setTimeout(resolve, 1));
  }
}
function fakeClient() {
  const callbacks = new Set<any>();
  let reads = 0, authReads = 0, completedReads = 0, fail = false;
  const client = {
    auth: {
      getUser() { authReads++; throw new Error('Unnecessary auth roundtrip'); },
      onAuthStateChange(callback: any) {
        callbacks.add(callback);
        return {data:{subscription:{unsubscribe(){callbacks.delete(callback);}}}};
      },
    },
    from(table: string) {
      reads++;
      let role = '';
      const query: any = {
        select(){return query;},
        eq(field: string,value: string){if(field==='role')role=value;return query;},
        maybeSingle(){return query;},
        abortSignal(){return query;},
        then(resolve: any){setTimeout(()=>{completedReads++;resolve({data:table==='user_profiles'?{role:'VISUAL DE EXISTENCIA'}:table==='user_module_permissions'?[{module:'inventory',can_access:true},{module:'ventas',can_access:false}]:role==='VISUAL DE EXISTENCIA'?[{permission_code:'reports.read'}]:[],error:fail?new Error('offline'):null});},2);},
      };
      return query;
    },
  };
  return {client,setFailure(value: boolean){fail=value;},emit(event: string,id: string|null){for(const cb of callbacks)cb(event,id?{user:{id}}:null);},completed:()=>completedReads,stats:()=>({reads,authReads})};
}

test('initial auth event resolves custom permissions without getUser or duplicate queries across consumers', async()=>{
  const fake=fakeClient();const a:any[]=[],b:any[]=[];
  const one=subscribeToRole(fake.client as any,s=>a.push(s));
  const two=subscribeToRole(fake.client as any,s=>b.push(s));
  fake.emit('INITIAL_SESSION','visitor');await until(()=>a.at(-1)?.moduleAccess.inventory && b.at(-1)?.moduleAccess.inventory);
  try {
    assert.equal(a.at(-1).loading,false);
    assert.equal(a.at(-1).moduleAccess.inventory,true);
    assert.equal(a.at(-1).moduleAccess.ventas,false);
    assert.equal(a.at(-1).moduleAccess.reports,true);
    assert.equal(b.at(-1).moduleAccess.reports,true);
    assert.deepEqual(fake.stats(),{reads:3,authReads:0});
  }finally{one.dispose();two.dispose();}
});

test('token refresh keeps the verified menu visible and signout clears it immediately',async()=>{
  const fake=fakeClient();const states:any[]=[];
  const sub=subscribeToRole(fake.client as any,s=>states.push(s));
  fake.emit('INITIAL_SESSION','visitor');await until(()=>states.at(-1)?.moduleAccess.inventory);
  states.length=0;
  fake.emit('TOKEN_REFRESHED','visitor');await until(()=>states.length>0);
  assert.ok(states.length>0);
  assert.ok(states.every(s=>!s.loading && s.moduleAccess.inventory));
  fake.emit('SIGNED_OUT',null);
  assert.equal(states.at(-1).moduleAccess.inventory,undefined);
  assert.equal(states.at(-1).loading,false);
  sub.dispose();
});

test('late permission responses cannot restore access after signout',async()=>{
  const fake=fakeClient();const states:any[]=[];
  const sub=subscribeToRole(fake.client as any,s=>states.push(s));
  fake.emit('INITIAL_SESSION','visitor');
  await until(()=>fake.stats().reads>0);
  fake.emit('SIGNED_OUT',null);await until(()=>fake.completed()===3);
  assert.deepEqual(states.at(-1).moduleAccess,{});
  sub.dispose();
});


test('permission failures stop loading without granting modules, and retry recovers',async()=>{
  const fake=fakeClient();fake.setFailure(true);const states:any[]=[];
  const sub=subscribeToRole(fake.client as any,s=>states.push(s));
  fake.emit('INITIAL_SESSION','visitor');await until(()=>Boolean(states.at(-1)?.error));
  assert.equal(states.at(-1).loading,false);
  assert.ok(states.at(-1).error);
  assert.deepEqual(states.at(-1).moduleAccess,{});
  fake.setFailure(false);sub.reload();await until(()=>states.at(-1)?.moduleAccess.inventory);
  assert.equal(states.at(-1).moduleAccess.inventory,true);
  assert.equal(states.at(-1).error,null);
  sub.dispose();
});

test('a missing initial auth event cannot leave the menu loading forever',t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const fake=fakeClient();const states:any[]=[];
  const sub=subscribeToRole(fake.client as any,s=>states.push(s));
  t.mock.timers.tick(8001);
  assert.equal(states.at(-1).loading,false);
  assert.ok(states.at(-1).error);
  assert.deepEqual(states.at(-1).moduleAccess,{});
  sub.dispose();
});

test('retry restarts a missing initial session and retains a bounded wait',t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const fake=fakeClient();const states:any[]=[];
  const sub=subscribeToRole(fake.client as any,s=>states.push(s));
  t.mock.timers.tick(8001);
  assert.ok(states.at(-1).error);
  sub.reload();
  assert.equal(states.at(-1).loading,true);
  assert.equal(states.at(-1).error,null);
  t.mock.timers.tick(8001);
  assert.equal(states.at(-1).loading,false);
  assert.ok(states.at(-1).error);
  sub.dispose();
});
