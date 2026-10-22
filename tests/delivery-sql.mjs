import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const db = new PGlite();
const schema = fs.readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8');
await db.exec(`create schema auth; create role anon; create role authenticated; create sequence order_number_seq;
create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;`);
for (const ddl of schema.match(/create type public\.[\s\S]*?;/g)) await db.exec(ddl);
for (const table of ['order_payments','cash_sessions','cash_movements','profiles','customers','customer_addresses','orders','dispatch_orders','kitchen_tickets','audit_logs']) {
  const ddl = schema.match(new RegExp(`create table if not exists public.${table} \\([\\s\\S]*?\\n\\);`))[0];
  await db.exec(ddl.replace(/ references (?:public|auth)\.\w+\(id\)(?: on delete (?:cascade|restrict|set null))?/g,''));
}
await db.exec(`create function is_active_staff() returns boolean language sql as $$select exists(select 1 from profiles where id=auth.uid() and is_active and role::text in ('administrador','cajero'))$$;`);
await db.exec(fs.readFileSync(new URL('../supabase/migrations/20261022090000_add_repartidor_role.sql',import.meta.url),'utf8'));
// Deliberately permissive legacy policies: the new restrictive guard must win.
for (const table of ['profiles','orders','dispatch_orders','order_payments','cash_sessions','cash_movements','customers','customer_addresses','kitchen_tickets','audit_logs']) {
  await db.exec(`alter table ${table} enable row level security; create policy legacy on ${table} for all to authenticated using(true) with check(true); grant select,insert,update,delete on ${table} to authenticated;`);
}
await db.exec(fs.readFileSync(new URL('../supabase/migrations/20261022091000_delivery_access.sql',import.meta.url),'utf8'));
const cashier='11111111-1111-4111-8111-111111111111';
const driver='22222222-2222-4222-8222-222222222222';
const other='33333333-3333-4333-8333-333333333333';
const order='44444444-4444-4444-8444-444444444444';
async function as(id) { await db.query("select set_config('test.uid',$1,false)",[id]); }
for(const [id,role] of [[cashier,'cajero'],[driver,'repartidor'],[other,'repartidor']]) await db.query('insert into profiles(id,email,full_name,role) values($1,$2,$2,$3)',[id,id+'@test.local',role]);
await db.query("insert into orders(id,number,type,payment_method,subtotal,total,cashier_id) values($1,'QA-REPARTO','despacho','efectivo',10000,12000,$2)",[order,cashier]);
await db.query('insert into dispatch_orders(order_id) values($1)',[order]);
await db.query('insert into kitchen_tickets(order_id) values($1)',[order]);
await as(cashier);
await assert.rejects(db.query('select assign_delivery_driver($1,$2)',[order,cashier]),/no disponible/);
await db.query('select assign_delivery_driver($1,$2)',[order,driver]);
await as(other);
assert.deepEqual((await db.query('select list_delivery_orders() as data')).rows[0].data,[]);
await assert.rejects(db.query('select complete_delivery($1)',[order]),/no está asignado/);
await as(driver);
await db.exec('set role authenticated');
assert.equal((await db.query('select count(*)::int as n from orders')).rows[0].n,0);
assert.equal((await db.query('select count(*)::int as n from profiles')).rows[0].n,1);
assert.equal((await db.query("update dispatch_orders set assigned_driver_id=null returning id")).rows.length,0);
await assert.rejects(db.query("update profiles set role='administrador' where id=$1",[driver]),/row-level security/);
assert.equal((await db.query('delete from profiles where id=$1 returning id',[driver])).rows.length,0);
await db.exec('reset role');
assert.equal((await db.query('select list_delivery_orders() as data')).rows[0].data.length,1);
await assert.rejects(db.query('select assign_delivery_driver($1,$2)',[order,other]),/Sin permiso/);
await assert.rejects(db.query('select list_delivery_drivers()'),/Sin permiso/);
await assert.rejects(db.query('select complete_delivery($1)',[order]),/aún no está listo/);
await db.query("update orders set status='listo' where id=$1",[order]);
// Audit failure must roll back all three state changes.
await db.exec("alter table audit_logs add constraint fail_delivery check(action <> 'entregar_reparto') not valid");
await assert.rejects(db.query('select complete_delivery($1)',[order]));
assert.equal((await db.query('select status from orders')).rows[0].status,'listo');
assert.equal((await db.query('select delivered_at from dispatch_orders')).rows[0].delivered_at,null);
await db.exec('alter table audit_logs drop constraint fail_delivery');
await db.query('select complete_delivery($1)',[order]);
await db.query('select complete_delivery($1)',[order]);
assert.equal((await db.query('select status from orders')).rows[0].status,'entregado');
assert.equal((await db.query('select status from kitchen_tickets')).rows[0].status,'entregado');
assert.equal((await db.query('select status from dispatch_orders')).rows[0].status,'entregado');
assert.equal((await db.query("select count(*)::int as n from audit_logs where action='entregar_reparto'")).rows[0].n,1);
// Web cash is booked exactly once, without changing POS collection behavior.
const web='55555555-5555-4555-8555-555555555555';
await db.query("insert into orders(id,number,type,status,source,payment_method,subtotal,total,cashier_id) values($1,'WEB-QA','despacho','listo','web','efectivo',10000,12000,$2)",[web,cashier]);
await db.query("insert into dispatch_orders(order_id,assigned_driver_id) values($1,$2)",[web,driver]);
await db.query("insert into order_payments(order_id,method,amount) values($1,'efectivo',12000)",[web]);
await assert.rejects(db.query('select complete_delivery($1)',[web]),/Caja debe estar abierta/);
assert.equal((await db.query('select status from orders where id=$1',[web])).rows[0].status,'listo');
await db.query("insert into cash_sessions(cashier_id,opening_amount,expected_amount) values($1,1000,1000)",[cashier]);
await db.query('select complete_delivery($1)',[web]);
await db.query('select complete_delivery($1)',[web]);
assert.equal(Number((await db.query('select expected_amount from cash_sessions')).rows[0].expected_amount),13000);
assert.equal((await db.query('select count(*)::int as n from cash_movements')).rows[0].n,1);
await db.exec(`update profiles set is_active=false where id='${driver}'`);
await assert.rejects(db.query('select list_delivery_orders()'),/Sin permiso/);
await assert.rejects(db.query('select complete_delivery($1)',[order]),/Solo el repartidor/);
await as('');
await assert.rejects(db.query('select list_delivery_orders()'),/Sin permiso/);
console.log('PASS reparto: assignment permissions, isolation, inactive users, readiness, atomic delivery, rollback and idempotency.');
// The default follows the same alphabetical ordering as the POS list.
await db.exec(fs.readFileSync(new URL('../supabase/migrations/20261022210000_default_delivery_driver.sql',import.meta.url),'utf8'));
await as(cashier);
await db.query("update profiles set full_name='Zoe',is_active=true where id=$1",[driver]);
await db.query("update profiles set full_name='Álvaro' where id=$1",[other]);
assert.equal((await db.query('select list_delivery_drivers() as data')).rows[0].data[0].id,other);
async function dispatch(id, selected = null) {
 await db.query("insert into orders(id,number,type,payment_method,subtotal,total,cashier_id) values($1::uuid,$1::text,'despacho','efectivo',10000,12000,$2)",[id,cashier]);
 await db.query('insert into dispatch_orders(order_id,assigned_driver_id) values($1,$2)',[id,selected]);
 return (await db.query('select assigned_driver_id from dispatch_orders where order_id=$1',[id])).rows[0].assigned_driver_id;
}
assert.equal(await dispatch('66666666-6666-4666-8666-666666666666'),other);
assert.equal(await dispatch('77777777-7777-4777-8777-777777777777',driver),driver);
await db.query('update profiles set is_active=false where id=$1',[other]);
assert.equal(await dispatch('88888888-8888-4888-8888-888888888888'),driver);
await db.query('update profiles set is_active=false where id=$1',[driver]);
assert.equal(await dispatch('99999999-9999-4999-8999-999999999999'),null);
await assert.rejects(dispatch('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',driver),/no disponible/);
await db.query('update dispatch_orders set assigned_driver_id=null where order_id=$1',[order]);
assert.equal((await db.query('select assigned_driver_id from dispatch_orders where order_id=$1',[order])).rows[0].assigned_driver_id,null);
console.log('PASS default driver: alphabetical and accent ordering, manual override, inactive/no drivers and explicit unassignment.');
await db.close();
