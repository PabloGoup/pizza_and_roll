process.on('uncaughtException', error => { console.error(error.message, error.where ?? ''); process.exit(1); });
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const read = name => fs.readFileSync(`supabase/${name}`, 'utf8');
const schema = read('schema.sql');
await db.exec(`
  create schema auth;
  create role anon;
  create role authenticated;
  create sequence order_number_seq;
  create function auth.uid() returns uuid language sql as $$
    select nullif(current_setting('test.uid',true),'')::uuid
  $$;
`);
for (const ddl of schema.match(/create type public\.[\s\S]*?;/g)) await db.exec(ddl);
for (const table of ['profiles', 'customers', 'customer_addresses', 'orders', 'order_payments', 'dispatch_orders', 'kitchen_tickets', 'cash_sessions', 'cash_movements', 'audit_logs']) {
  const ddl = schema.match(new RegExp(`create table if not exists public.${table} \\([\\s\\S]*?\\n\\);`))[0];
  await db.exec(ddl.replace(/ references (?:public|auth)\.\w+\(id\)(?: on delete (?:cascade|restrict|set null))?/g, ''));
}
await db.exec("alter type app_role add value 'repartidor'");
await db.exec(`alter table dispatch_orders add column archived_at timestamptz, add column archive_reason text, add column assigned_driver_id uuid, add column delivered_at timestamptz, add column delivered_driver_id uuid, add column delivered_driver_name text`);
// Install the existing archive and driver functions without the historical one-off reset.
const previous = read('migrations/20261022233000_archive_accumulated_delivery_queue.sql');
const start = previous.indexOf('create or replace function public.complete_delivery(');
await db.exec(previous.slice(start, previous.indexOf('\n$$;', start) + 4));
await db.exec(read('migrations/20261022235500_delivery_payment_details.sql'));
await db.exec(read('migrations/20261108000400_archive_delivery_on_cash_close.sql'));
const cashier = randomUUID(), driver = randomUUID(), session = randomUUID();
await db.query("insert into profiles(id,email,full_name,role) values($1,'cash@test','QA caja','cajero'),($2,'driver@test','QA reparto','repartidor')", [cashier, driver]);
await db.query("select set_config('test.uid',$1,false)", [cashier]);
await db.query("insert into cash_sessions(id,cashier_id,expected_amount,opened_at) values($1,$2,1000,'2026-11-08T19:00:00Z')", [session, cashier]);
async function order(created, status = 'listo', type = 'despacho', archived = false) {
  const id = randomUUID();
  await db.query('insert into orders(id,number,type,status,source,payment_method,total,cashier_id,created_at) values($1,$2,$3,$4,\'web\',\'efectivo\',5000,$5,$6)', [id, `QA-${id}`, type, status, cashier, created]);
  await db.query('insert into dispatch_orders(order_id,assigned_driver_id,status,archived_at) values($1,$2,$3,$4)', [id, driver, ['entregado','cancelado'].includes(status) ? status : 'pendiente', archived ? '2026-11-01T00:00:00Z' : null]);
  await db.query('insert into kitchen_tickets(order_id,status) values($1,$2)', [id, status]);
  await db.query("insert into order_payments(order_id,method,amount) values($1,'efectivo',5000)", [id]);
  return id;
}
const oldOrder = await order('2026-11-07T19:00:00Z');
const current = await order('2026-11-08T20:00:00Z');
const boundary = await order('2026-11-08T23:00:00Z');
const future = await order('2026-11-08T23:00:00.001Z');
const delivered = await order('2026-11-08T20:00:00Z', 'entregado');
const cancelled = await order('2026-11-08T20:00:00Z', 'cancelado');
const otherType = await order('2026-11-08T20:00:00Z', 'listo', 'retiro_local');
const alreadyArchived = await order('2026-11-01T00:00:00Z', 'listo', 'despacho', true);
assert.equal((await db.query('select list_delivery_orders() as data')).rows[0].data.length, 4);
const close = () => db.query("update cash_sessions set status='cerrada',closed_at='2026-11-08T23:00:00Z' where id=$1", [session]);
const archiveOf = async id => (await db.query('select archived_at,archive_reason from dispatch_orders where order_id=$1', [id])).rows[0];

// A failed close must leave every pending delivery active.
await db.exec(`create function fail_close_audit() returns trigger language plpgsql as $$
 begin raise exception 'QA close audit failure'; end $$;
 create trigger fail_close_audit before insert on audit_logs for each row execute function fail_close_audit();`);
await assert.rejects(close(), /QA close audit failure/);
assert.equal((await db.query('select status from cash_sessions where id=$1', [session])).rows[0].status, 'abierta');
assert.equal((await archiveOf(current)).archived_at, null);
await db.exec('drop trigger fail_close_audit on audit_logs');
await close();
assert.deepEqual((await db.query('select list_delivery_orders() as data')).rows[0].data.map(order => order.id), [future]);
for (const id of [oldOrder, current, boundary]) {
  assert.ok((await archiveOf(id)).archived_at);
  assert.match((await archiveOf(id)).archive_reason, new RegExp(session));
  assert.equal((await db.query('select status from orders where id=$1', [id])).rows[0].status, 'listo');
}
for (const id of [future, delivered, cancelled, otherType]) assert.equal((await archiveOf(id)).archived_at, null);
assert.equal(new Date((await archiveOf(alreadyArchived)).archived_at).toISOString(), '2026-11-01T00:00:00.000Z');
assert.equal(Number((await db.query('select expected_amount from cash_sessions where id=$1', [session])).rows[0].expected_amount), 1000);
assert.equal(Number((await db.query('select count(*) from cash_movements')).rows[0].count), 0);
assert.equal((await db.query("select new_value->>'archived_count' as count from audit_logs where action='archivar_reparto_cierre_caja'")).rows[0].count, '3');
await close();
assert.equal(Number((await db.query('select count(*) from audit_logs')).rows[0].count), 1, 'Retry must not duplicate archive audit');
await db.query("select set_config('test.uid',$1,false)", [driver]);
await assert.rejects(db.query('select complete_delivery($1)', [current]), /cerrado por caja/);

// Opening a new session keeps new deliveries available and collection idempotent.
const nextSession = randomUUID();
await db.query('insert into cash_sessions(id,cashier_id,expected_amount) values($1,$2,0)', [nextSession, cashier]);
await db.query('select complete_delivery($1)', [future]);
await db.query('select complete_delivery($1)', [future]);
assert.equal(Number((await db.query('select expected_amount from cash_sessions where id=$1', [nextSession])).rows[0].expected_amount), 5000);
await db.query("select set_config('test.uid',$1,false)", [cashier]);
const posStatusOrder = await order('2026-11-08T23:01:00Z');
await db.query("select update_pos_order_status($1,'entregado')", [posStatusOrder]);
await db.query("select update_pos_order_status($1,'entregado')", [posStatusOrder]);
assert.equal(Number((await db.query('select expected_amount from cash_sessions where id=$1', [nextSession])).rows[0].expected_amount), 10000);
await db.close();
console.log('PASS cash close delivery: current/older cutoff, future orders, history, rollback, retry, closed-order guard and driver/POS cash collection');
