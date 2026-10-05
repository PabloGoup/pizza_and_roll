process.on('uncaughtException', error => { console.error(error.message); process.exit(1); });
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const db = new PGlite();
const root = new URL('../', import.meta.url).pathname;
const schema=fs.readFileSync(`${root}/supabase/schema.sql`,'utf8');
await db.exec("create sequence public.order_number_seq; create schema auth; create role authenticated; create function auth.uid() returns uuid language sql as $$ select current_setting('test.uid', true)::uuid $$;");
for(const declaration of schema.match(/create type public\.[\s\S]*?;/g)) await db.exec(declaration);
for(const table of ['profiles','orders','order_payments','cash_sessions','cash_movements','dispatch_orders','audit_logs']) {
  let ddl=schema.match(new RegExp(`create table if not exists public.${table} \\([\\s\\S]*?\\n\\);`))[0];
  ddl=ddl.replace(/ references (?:public|auth)\.\w+\(id\)(?: on delete (?:cascade|restrict|set null))?/g,'');
  await db.exec(ddl);
}
await db.exec(fs.readFileSync(`${root}/supabase/migrations/20261005150000_update_order_fulfillment.sql`,'utf8'));
const actor='11111111-1111-4111-8111-111111111111';
await db.exec(`select set_config('test.uid','${actor}',false); insert into profiles(id,email,full_name,role) values('${actor}','qa@example.test','QA','cajero'); insert into cash_sessions(id,cashier_id,opened_at,expected_amount) values('${actor}','${actor}',now()-interval '1 hour',10000);`);
let n=0;
async function order(method='efectivo', source='pos') {
 const id=`22222222-2222-4222-8222-${String(++n).padStart(12,'0')}`;
 await db.query("insert into orders(id,number,type,payment_method,source,cashier_id,total,subtotal) values($1,$2,'retiro_local',$3,$4,$5,10000,10000)",[id,`QA-${n}`,method,source,actor]);
 await db.query('insert into order_payments(order_id,method,amount) values($1,$2,10000)',[id,method]);
 return id;
}
async function read(id) {return (await db.query('select *, updated_at::text as updated_at from orders where id=$1',[id])).rows[0];}
async function change(id,type,fee) {const row=await read(id);return db.query('select update_order_fulfillment($1,$2,$3,$4)',[id,type,fee,row.updated_at]);}
const id=await order();
await assert.rejects(change(id,'despacho',0),/mínima/);
assert.equal(Number((await read(id)).total),10000);
await change(id,'despacho',2000);
assert.equal(Number((await read(id)).total),12000);
assert.equal(Number((await db.query('select expected_amount from cash_sessions')).rows[0].expected_amount),12000);
assert.equal(Number((await db.query('select amount from order_payments where order_id=$1',[id])).rows[0].amount),12000);
const countBeforeRetry = (await db.query('select count(*)::int as n from cash_movements')).rows[0].n;
await change(id,'despacho',2000);
assert.equal((await db.query('select count(*)::int as n from cash_movements')).rows[0].n, countBeforeRetry);
await db.query("update dispatch_orders set status='en_ruta' where order_id=$1",[id]);
await change(id,'despacho',3000);
assert.equal((await db.query('select status from dispatch_orders where order_id=$1',[id])).rows[0].status,'en_ruta');
assert.equal(Number((await read(id)).total),13000);
await change(id,'consumo_local',0);
assert.equal(Number((await read(id)).total),10000);
assert.equal(Number((await db.query('select expected_amount from cash_sessions')).rows[0].expected_amount),10000);
assert.equal((await db.query('select status from dispatch_orders where order_id=$1',[id])).rows[0].status,'cancelado');
const movements=(await db.query('select count(*)::int as n from cash_movements')).rows[0].n;
const card=await order('tarjeta'); await change(card,'despacho',2500);
assert.equal(Number((await db.query('select amount from order_payments where order_id=$1',[card])).rows[0].amount),12500);
const web=await order('efectivo','web');await change(web,'despacho',2000);
assert.equal((await db.query('select count(*)::int as n from cash_movements')).rows[0].n,movements);
const mixed=await order('mixto');await assert.rejects(change(mixed,'despacho',2000),/Distribuye/);
assert.equal(Number((await read(mixed)).total),10000);
await assert.rejects(db.query('select update_order_fulfillment($1,$2,$3,$4)',[id,'despacho',2000,'2000-01-01']),/cambió/);
await db.exec("update profiles set is_active=false");
await assert.rejects(change(id,'despacho',2000),/permiso/);
await db.exec("update profiles set is_active=true");
const cancelled=await order();
await db.query("update orders set status='cancelado' where id=$1",[cancelled]);
await assert.rejects(change(cancelled,'despacho',2000),/anulada/);
// Force the final audit write to fail and check that all earlier writes roll back.
await db.exec("alter table audit_logs add constraint fail_qa check (action <> 'actualizar_consumo') not valid");
await assert.rejects(change(id,'despacho',4000));
assert.equal(Number((await read(id)).total),10000);
assert.equal(Number((await db.query('select expected_amount from cash_sessions')).rows[0].expected_amount),10000);
console.log('PASS SQL: minimum, fee delta, local/pickup removal, payment total, cash drawer, unpaid web, mixed rejection, stale version and atomic rollback.');
await db.close();
