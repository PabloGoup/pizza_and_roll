process.on('uncaughtException', error => { console.error(error.message, error.where ?? ''); process.exit(1); });
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
const db=new PGlite();
const read=name=>fs.readFileSync(new URL('../supabase/'+name,import.meta.url),'utf8');
const schema=read('schema.sql');
await db.exec(`create schema auth; create role anon; create role authenticated; create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.uid',true),'')::uuid $$; create sequence order_number_seq; create function auth.jwt() returns jsonb language sql as $$ select jsonb_build_object('session_id',nullif(current_setting('test.sid',true),'')) $$;`);
for(const ddl of schema.match(/create type public\.[\s\S]*?;/g)) await db.exec(ddl);
for(const table of ['profiles','product_categories','products','product_variants','product_modifier_groups','product_modifiers','customers','customer_addresses','orders','order_payments','order_items','order_item_modifiers','kitchen_tickets','dispatch_orders','cash_sessions','cash_movements','audit_logs','ingredients','recipes','recipe_items']) {
 let ddl=schema.match(new RegExp(`create table if not exists public.${table} \\([\\s\\S]*?\\n\\);`))[0];
 await db.exec(ddl.replace(/ references (?:public|auth)\.\w+\(id\)(?: on delete (?:cascade|restrict|set null))?/g,''));
}
await db.exec(`alter table orders add column tip_amount numeric not null default 0;
alter table kitchen_tickets add column dismissed_at timestamptz;
alter table products add column is_sold_out boolean default false;
alter table ingredients add column is_sold_out boolean default false;
alter table dispatch_orders add column assigned_driver_id uuid;
create table print_agents(id uuid primary key,is_active boolean default true,printer_name text,last_seen_at timestamptz,created_at timestamptz default now());
create table print_jobs(id uuid primary key default gen_random_uuid(),order_id uuid,job_type text,dedupe_key text unique,target_agent_id uuid,requested_by uuid,available_at timestamptz default now());`);
const print=read('add_print_agent_queue.sql');
let start=print.indexOf('create function public.enqueue_kitchen_print(');
await db.exec(print.slice(start,print.indexOf('\n$$;',start)+4));
await db.exec(read('allow_sold_out_ingredient_substitutions.sql'));
await db.exec('create trigger validate_order_item_availability_trigger before insert on order_items for each row execute function validate_order_item_availability()');
await db.exec(read('migrations/20261023001000_fast_pos_checkout.sql'));
await db.exec(read('migrations/20261023002000_fast_kitchen_read.sql'));
const guard=read('migrations/20261118000100_pos_large_order_guard.sql');
await db.exec(guard);
await db.exec(guard); // idempotent: a second run must not break or re-wrap the function
const cashier=randomUUID(),product=randomUUID(),category=randomUUID(),station=randomUUID(),sid=randomUUID();
await db.query("insert into profiles(id,email,full_name,role) values($1,'cash@test','QA cajero','cajero')",[cashier]);
await db.query("insert into product_categories(id,name) values($1,'Hand Roll')",[category]);
await db.query("insert into products(id,category_id,name,base_price) values($1,$2,'Hand Roll Tori',3000)",[product,category]);
await db.query("insert into cash_sessions(id,cashier_id,opening_amount,expected_amount) values($1,$2,0,0)",[randomUUID(),cashier]);
await db.query("insert into print_agents(id,printer_name) values($1,'QA Printer')",[station]);
await db.query("select set_config('test.uid',$1,false), set_config('test.sid',$2,false), set_config('request.headers',$3,false)",[cashier,sid,JSON.stringify({'user-agent':'Mozilla/5.0 (X11; Linux x86_64) Chrome/157','x-forwarded-for':'190.114.43.103, 10.0.0.1'})]);
const create=(qty,extra={})=>db.query('select create_pos_order($1,$2,$3,$4) as data',[randomUUID(),JSON.stringify([{productId:product,quantity:qty,unitPrice:3000,modifiers:[]}]),JSON.stringify({type:'consumo_local',paymentMethod:'efectivo',paymentBreakdown:{cash:qty*3000,card:0,transfer:0},deliveryFee:0,tipAmount:0,discountAmount:0,promotionAmount:0,extraCharges:[],...extra}),station]).then(r=>r.rows[0].data);
const count=async t=>(await db.query(`select count(*)::int as n from ${t}`)).rows[0].n;

// Small sale: no confirmation needed, device recorded.
const small=await create(2);
assert.equal(small.total,6000);
const row=(await db.query('select pos_session_id,pos_client from orders where id=$1',[small.id])).rows[0];
assert.equal(row.pos_session_id,sid);
assert.equal(row.pos_client.userAgent,'Mozilla/5.0 (X11; Linux x86_64) Chrome/157');
assert.equal(row.pos_client.ip,'190.114.43.103');

// Above $100.000 the sale is rejected unless the cashier confirmed it.
const before={orders:await count('orders'),cash:await count('cash_movements'),tickets:await count('kitchen_tickets'),jobs:await count('print_jobs'),audit:await count('audit_logs')};
await assert.rejects(create(34),/sin confirmar/); // 34 x 3000 = 102.000
await assert.rejects(create(80,{largeOrderConfirmed:false}),/sin confirmar/);
assert.deepEqual({orders:await count('orders'),cash:await count('cash_movements'),tickets:await count('kitchen_tickets'),jobs:await count('print_jobs'),audit:await count('audit_logs')},before);
assert.equal(Number((await db.query('select expected_amount from cash_sessions')).rows[0].expected_amount),6000);

// Confirmed large sale goes through.
const large=await create(34,{largeOrderConfirmed:true});
assert.equal(large.total,102000);
assert.equal((await db.query('select pos_client from orders where id=$1',[large.id])).rows[0].pos_client.largeOrderConfirmed,true);

// The unguarded core cannot be called directly by app users.
assert.equal((await db.query("select has_function_privilege('authenticated','public.create_pos_order_core(uuid,jsonb,jsonb,uuid)','execute') as ok")).rows[0].ok,false);
assert.equal((await db.query("select has_function_privilege('authenticated','public.create_pos_order(uuid,jsonb,jsonb,uuid)','execute') as ok")).rows[0].ok,true);
// Sales go through when the selected print computer is unavailable (kitchen works from the KDS).
const fallback=read('migrations/20261121000100_pos_sale_without_printer.sql');
await db.exec(fallback);
await db.exec(fallback); // idempotent
const online=await create(1);
assert.equal(online.printAgentUnavailable,undefined);
await db.query("update print_agents set printer_name=null where id=$1",[station]);
const offline=await create(1);
assert.equal(offline.total,3000);
assert.equal(offline.printAgentUnavailable,true);
assert.equal((await db.query('select count(*)::int as n from kitchen_tickets where order_id=$1',[offline.id])).rows[0].n,1);
assert.equal((await db.query('select target_agent_id from print_jobs where order_id=$1',[offline.id])).rows[0].target_agent_id,null);
await db.query("update print_agents set is_active=false,printer_name='QA Printer' where id=$1",[station]);
assert.equal((await create(1)).printAgentUnavailable,true);
// A retry of an already saved sale returns the same order, even if the printer went offline meanwhile.
await db.query("update print_agents set is_active=true where id=$1",[station]);
const retryId=randomUUID();
const retryArgs=[retryId,JSON.stringify([{productId:product,quantity:1,unitPrice:3000,modifiers:[]}]),JSON.stringify({type:'consumo_local',paymentMethod:'efectivo',paymentBreakdown:{cash:3000,card:0,transfer:0},deliveryFee:0,tipAmount:0,discountAmount:0,promotionAmount:0,extraCharges:[]}),station];
const first=(await db.query('select create_pos_order($1,$2,$3,$4) as data',retryArgs)).rows[0].data;
await db.query("update print_agents set is_active=false where id=$1",[station]);
const again=(await db.query('select create_pos_order($1,$2,$3,$4) as data',retryArgs)).rows[0].data;
assert.equal(again.id,first.id);
await assert.rejects(create(34),/sin confirmar/); // large-order guard still applies
console.log('PASS large order guard: >$100.000 needs confirmation, blocked sales roll back fully, device/session recorded, core not exposed, migration idempotent, sale saved without an available printer.');
