import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const schema = fs.readFileSync('supabase/schema.sql', 'utf8');
await db.exec(`
  create schema auth;
  create role anon;
  create role authenticated;
  create function auth.uid() returns uuid language sql as $$
    select nullif(current_setting('test.uid', true), '')::uuid
  $$;
  create sequence order_number_seq;
`);
for (const ddl of schema.match(/create type public\.[\s\S]*?;/g)) await db.exec(ddl);
for (const table of ['profiles', 'orders', 'order_payments', 'kitchen_tickets', 'cash_sessions', 'cash_movements', 'audit_logs']) {
  const ddl = schema.match(new RegExp(`create table if not exists public.${table} \\([\\s\\S]*?\\n\\);`))[0];
  await db.exec(ddl.replace(/ references (?:public|auth)\.\w+\(id\)(?: on delete (?:cascade|restrict|set null))?/g, ''));
}
await db.exec(fs.readFileSync('supabase/migrations/20261108000300_fast_pos_order_status.sql', 'utf8'));
const cashier = randomUUID();
const customer = randomUUID();
const session = randomUUID();
await db.query("insert into profiles(id,email,full_name,role) values($1,'cash@test','QA cajero','cajero'),($2,'customer@test','QA cliente','cliente')", [cashier, customer]);
await db.query('insert into cash_sessions(id,cashier_id,opening_amount,expected_amount) values($1,$2,1000,1000)', [session, cashier]);
const as = id => db.query("select set_config('test.uid',$1,false)", [id]);
async function createOrder(source, method = 'efectivo', status = 'listo') {
  const id = randomUUID();
  await db.query('insert into orders(id,number,source,type,status,payment_method,cashier_id,total) values($1,$2,$3,\'retiro_local\',$4,$5,$6,5000)', [id, `QA-${id}`, source, status, method, cashier]);
  await db.query('insert into kitchen_tickets(order_id,status) values($1,$2)', [id, status]);
  await db.query('insert into order_payments(order_id,method,amount) values($1,$2,5000)', [id, method]);
  return id;
}
const update = (id, status) => db.query('select update_pos_order_status($1,$2) as saved', [id, status]);
const statusOf = async id => (await db.query('select status from orders where id=$1', [id])).rows[0].status;
const balance = async () => Number((await db.query('select expected_amount from cash_sessions where id=$1', [session])).rows[0].expected_amount);

const local = await createOrder('pos');
await as('');
await assert.rejects(update(local, 'entregado'), /permiso/);
await as(customer);
await assert.rejects(update(local, 'entregado'), /permiso/);
await as(cashier);
await db.query('update profiles set is_active=false where id=$1', [cashier]);
await assert.rejects(update(local, 'entregado'), /permiso/);
await db.query('update profiles set is_active=true where id=$1', [cashier]);
await assert.rejects(update(local, 'en_preparacion'), /no permitido/);
await assert.rejects(update(randomUUID(), 'entregado'), /No se encontró/);
const cancelled = await createOrder('pos', 'efectivo', 'cancelado');
await assert.rejects(update(cancelled, 'entregado'), /anulada/);

const saved = (await update(local, 'entregado')).rows[0].saved;
assert.equal(saved.status, 'entregado');
assert.equal(saved.id, local);
assert.equal((await db.query('select status from kitchen_tickets where order_id=$1', [local])).rows[0].status, 'entregado');
assert.equal(await balance(), 1000, 'POS cash was collected at checkout');
await update(local, 'entregado');
assert.equal(Number((await db.query('select count(*) from audit_logs')).rows[0].count), 1, 'Retry must not duplicate audit');

for (const source of ['web', 'whatsapp']) {
  const id = await createOrder(source);
  const previousBalance = await balance();
  await update(id, 'entregado');
  await update(id, 'entregado');
  await update(id, 'pendiente');
  await update(id, 'listo');
  await update(id, 'entregado');
  assert.equal(await balance(), previousBalance + 5000, 'Cash is collected once even after returning to preparation');
  assert.equal(Number((await db.query('select count(*) from cash_movements where linked_order_id=$1', [id])).rows[0].count), 1);
}
const card = await createOrder('web', 'tarjeta');
const beforeCard = await balance();
await update(card, 'entregado');
assert.equal(await balance(), beforeCard);
const mixed = await createOrder('whatsapp', 'mixto');
await db.query('delete from order_payments where order_id=$1', [mixed]);
await db.query("insert into order_payments(order_id,method,amount) values($1,'efectivo',2000),($1,'tarjeta',3000)", [mixed]);
await update(mixed, 'entregado');
assert.equal(await balance(), beforeCard + 2000);

const noDrawer = await createOrder('web');
await db.query("update cash_sessions set status='cerrada' where id=$1", [session]);
await assert.rejects(update(noDrawer, 'entregado'), /Caja debe estar abierta/);
assert.equal(await statusOf(noDrawer), 'listo');
await db.query("update cash_sessions set status='abierta' where id=$1", [session]);

// Failure after collecting cash and updating statuses must roll the whole operation back.
const failed = await createOrder('web');
const beforeFailure = await balance();
await db.exec(`create function reject_status_audit() returns trigger language plpgsql as $$
  begin raise exception 'QA audit failure'; end $$;
  create trigger reject_status_audit before insert on audit_logs for each row execute function reject_status_audit();`);
await assert.rejects(update(failed, 'entregado'), /QA audit failure/);
assert.equal(await statusOf(failed), 'listo');
assert.equal((await db.query('select status from kitchen_tickets where order_id=$1', [failed])).rows[0].status, 'listo');
assert.equal(await balance(), beforeFailure);
assert.equal(Number((await db.query('select count(*) from cash_movements where linked_order_id=$1', [failed])).rows[0].count), 0);
await db.close();
console.log('PASS status SQL: permissions, kitchen consistency, idempotency, POS/web/WhatsApp/mixed cash, rollback and closed drawer');

function load(file, imports) {
  const sandbox = { exports: {}, require: name => {
    if (!(name in imports)) throw new Error(`Unexpected import ${name}`);
    return imports[name];
  } };
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(js, sandbox);
  return sandbox.exports;
}
const requests = [];
const confirmed = { id: 'first', status: 'entregado', updatedAt: '2026-11-08T22:00:00Z' };
const service = load('src/features/sales/services/sales-service.ts', {
  '@/features/printing/lib/print-station': {}, '@/features/sales/lib/charges': {},
  '@/lib/business': {}, '@/lib/supabase/audit': {},
  '@/lib/supabase/errors': { formatSupabaseError: text => text },
  '@/lib/supabase/client': { getSupabaseClient: () => ({
    rpc: async (name, args) => { requests.push({ name, args }); return { data: confirmed, error: null }; },
    from: () => { throw new Error('Status change must not download history or write separate tables'); },
  }) },
}).salesService;
assert.equal((await service.updateOrderStatus('first', 'entregado', { isActive: true })).status, 'entregado');
assert.equal(requests.length, 1);
assert.equal(requests[0].name, 'update_pos_order_status');
let cache = [{ id: 'first', status: 'listo', items: ['retained'] }, { id: 'other', status: 'listo' }];
let refreshes = 0;
const hooks = load('src/features/sales/hooks/use-sales.ts', {
  react: { useRef: value => ({ current: value }) },
  sonner: { toast: { error: () => {} } },
  '@tanstack/react-query': {
    useMutation: config => config,
    useMutationState: config => ['first', 'other'].map(id => config.select({ state: { variables: { orderId: id } } })),
    useQueryClient: () => ({
      setQueriesData: (_key, fn) => { cache = fn(cache); },
      invalidateQueries: () => { refreshes++; return new Promise(() => {}); },
    }),
  },
  '@/features/sales/services/sales-service': { salesService: service },
});
const mutation = hooks.useUpdateOrderStatus({ isActive: true });
assert.deepEqual(Array.from(mutation.pendingOrderIds), ['first', 'other']);
assert.equal(mutation.onSuccess(confirmed), undefined, 'Slow reports must not hold the mutation pending');
assert.equal(cache[0].status, 'entregado');
assert.equal(cache[0].items[0], 'retained');
assert.equal(cache[1].status, 'listo');
assert.equal(refreshes, 5);
console.log('PASS status client: one request, immediate committed cache, independent pending rows, background report refreshes');
