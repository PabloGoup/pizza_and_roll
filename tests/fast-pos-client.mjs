import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { webcrypto } from 'node:crypto';
function load(path, imports,globals={}) {
 const sandbox={exports:{},performance,crypto:webcrypto,...globals,require:name=>{if(!(name in imports)) throw new Error('Unexpected import '+name);return imports[name];}};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,sandbox);return sandbox.exports;
}
let requests=[];
const sample={id:'order',number:'PR-QA',kitchenPrintQueued:true,items:[]};
const service=load('src/features/sales/services/sales-service.ts',{
 '@/features/printing/lib/print-station':{getSelectedPrintStationId:()=>null},
 '@/features/sales/lib/charges':{},'@/lib/business':{},'@/lib/supabase/audit':{},
 '@/lib/supabase/errors':{formatSupabaseError:text=>text},
 '@/lib/supabase/client':{getSupabaseClient:()=>({rpc:async(name,args)=>{requests.push({name,args});return {data:sample,error:null};},from:()=>{throw new Error('Checkout must not fetch or mutate individual tables');}})},
}).salesService;
assert.equal((await service.createOrder([{quantity:3}],{type:'consumo_local'},{id:'cashier',isActive:true},'same-request')).id,'order');
assert.equal(requests.length,1);assert.equal(requests[0].name,'create_pos_order');assert.equal(requests[0].args.p_request_id,'same-request');
let current=[];let refreshes=[];
const client={setQueryData:(key,fn)=>{current=fn(current);},invalidateQueries:args=>{refreshes.push(args);return new Promise(()=>{});}};
const hooks=load('src/features/sales/hooks/use-sales.ts',{
 react:{useRef:value=>({current:value})},
 '@tanstack/react-query':{useQueryClient:()=>client,useMutation:config=>config},
 '@/features/sales/services/sales-service':{salesService:service},
});
const mutation=hooks.useCreateOrder({id:'cashier',isActive:true});
const input={cart:[{quantity:1}],payload:{type:'consumo_local'}};
await mutation.mutationFn(input);await mutation.mutationFn(input);
assert.equal(requests.at(-1).args.p_request_id,requests.at(-2).args.p_request_id,'A retry must reuse its request ID');
const firstId=requests.at(-1).args.p_request_id;
assert.equal(mutation.onSuccess(sample),undefined,'Print must not await report refreshes');
assert.equal(current[0].id,'order');assert.equal(refreshes.length,5);
await mutation.mutationFn(input);
assert.notEqual(requests.at(-1).args.p_request_id,firstId,'A new sale receives a fresh ID');
console.log('PASS checkout client: one HTTP request regardless of cart size, no history reads, nonblocking cache refresh, safe retry and fresh sale IDs.');
// A new ticket arriving during a kitchen fetch must trigger a follow-up fetch,
// rather than waiting for the five-second fallback interval.
let finishFirst; let kitchenCalls=0; let latestKitchen;
const kitchenModule=load('src/features/kitchen/hooks/use-kitchen-tickets.ts',{
 react:{useCallback:fn=>fn,useEffect:()=>{},useRef:value=>({current:value}),useState:initial=>[initial,value=>{if(Array.isArray(value)) latestKitchen=value;}]},
 '@/lib/supabase/client':{isSupabaseConfigured:true,getSupabaseClient:()=>({rpc:async name=>{
  assert.equal(name,'list_active_kitchen_orders');kitchenCalls++;
  if(kitchenCalls===1) return new Promise(resolve=>{finishFirst=resolve;});
  return {data:[{order_id:'new',ticket_status:'pendiente'}],error:null};
 }})},
});
const kitchen=kitchenModule.useKitchenTickets();
const loading=kitchen.refreshTickets();
await kitchen.refreshTickets();
finishFirst({data:[],error:null});
await loading;
assert.equal(kitchenCalls,2);
assert.equal(latestKitchen[0].order_id,'new');
console.log('PASS kitchen fetch: single RPC projection and no lost refresh when a new ticket arrives during a pending request.');
