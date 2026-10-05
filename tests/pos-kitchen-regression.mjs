import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function load(file, imports, extra = '', globals = {}) {
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8') + extra, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const sandbox = { ...globals, exports: {}, require: (name) => {
    if (!(name in imports)) throw new Error(`Unexpected import: ${name}`);
    return imports[name];
  } };
  vm.runInNewContext(js, sandbox);
  return sandbox.exports;
}

// Exercise state transitions without device audio or production orders.
let refs = [], cursor = 0, effects = [], sounds = 0, notices = [];
const react = {
  useRef: (value) => refs[cursor++] ?? (refs[cursor - 1] = { current: value }),
  useEffect: (fn) => effects.push(fn),
};
let selectedSound;
const sound = { useOrderSound: (kind) => { selectedSound = kind; return { play: () => sounds++ }; } };
const readyHook = load('src/features/sales/hooks/use-ready-order-alert.ts', {
  react, '@/hooks/use-order-sound': sound, sonner: { toast: { success: (message) => notices.push(message) } },
}).useReadyOrderAlert;
function render(hook, records, ready = true) {
  cursor = 0; effects = []; hook(records, ready); effects.forEach((effect) => effect());
}
render(readyHook, [], false);
render(readyHook, [{ id: 'a', status: 'pendiente' }, { id: 'old', status: 'listo' }]);
assert.equal(sounds, 0, 'Opening the page must not ring for old orders');
render(readyHook, [{ id: 'a', number: 'PR-A', status: 'listo' }]);
assert.equal(sounds, 1);
assert.match(notices[0], /PR-A listo para empacar/);
render(readyHook, [{ id: 'a', status: 'listo' }]);
render(readyHook, []);
render(readyHook, [{ id: 'a', status: 'listo' }]);
assert.equal(sounds, 1, 'Polling and temporary disappearance must not duplicate alerts');
render(readyHook, [{ id: 'a', status: 'entregado' }, { id: 'b', status: 'listo' }]);
assert.equal(sounds, 2);
assert.equal(selectedSound, 'cash-ready');
refs = []; sounds = 0;
const kitchenHook = load('src/features/kitchen/hooks/use-kitchen-alert.ts', {
  react, '@/hooks/use-order-sound': sound,
}).useKitchenAlert;
render(kitchenHook, [{ order_id: 'old' }]);
render(kitchenHook, [{ order_id: 'old' }, { order_id: 'new' }]);
render(kitchenHook, [{ order_id: 'new' }]);
assert.equal(sounds, 1, 'Kitchen new-order alert remains compatible');
assert.equal(selectedSound, 'kitchen-new');

// Supabase stub records writes so partial details cannot accidentally rewrite items/payments.
let writes = [];
const order = { id: 'order', number: 'PR-TEST', type: 'despacho', status: 'pendiente', source: 'web',
  payment_method: 'efectivo', total: 5000, order_items: [], order_payments: [{ method: 'efectivo', amount: 5000 }] };
const client = { from(table) {
  let operation = 'select';
  const query = {
    select() { return query; }, eq() { return query; }, is() { return query; }, limit() { return query; },
    order() { return query; }, gte() { return query; }, lte() { return query; },
    insert(payload) { operation = 'insert'; writes.push({ table, operation, payload }); return query; },
    update(payload) { operation = 'update'; writes.push({ table, operation, payload }); return query; },
    delete() { operation = 'delete'; writes.push({ table, operation }); return query; },
    single() { return query; }, maybeSingle() { return query; },
    then(resolve) {
      const data = table === 'orders' ? [order] : table === 'product_categories' ? [] :
        table === 'cash_sessions' ? { id: 'session', expected_amount: 10000 } :
        operation === 'insert' ? { id: `${table}-id` } : null;
      return Promise.resolve({ data, error: null }).then(resolve);
    },
  };
  return query;
} };
const service = load('src/features/sales/services/sales-service.ts', {
  '@/features/sales/lib/charges': load('src/features/sales/lib/charges.ts', {}),
  '@/lib/business': { getCashAmountFromBreakdown: (value) => value.cash },
  '@/lib/supabase/audit': { createAuditLog: async () => {} },
  '@/lib/supabase/client': { getSupabaseClient: () => client },
  '@/lib/supabase/errors': { formatSupabaseError: (text) => text, isUuid: () => true },
}, '\nexport { findOrCreateCustomer };');
for (const payload of [{}, { customerName: 'Ana' }, { customerPhone: '123' }]) {
  writes = [];
  await service.findOrCreateCustomer({ type: 'despacho', ...payload });
  assert.equal(writes.length, 0, 'Incomplete identity must not create a fake customer');
}
for (const partial of [{}, { customerName: 'Solo nombre' }, { customerPhone: '123' }]) {
  writes = [];
  await service.salesService.updateOrderDetails('order', partial, { id: 'actor' });
  const saved = writes.find((entry) => entry.table === 'orders').payload;
  assert.equal(saved.customer_name_snapshot, partial.customerName ?? null);
  assert.equal(saved.customer_phone_snapshot, partial.customerPhone ?? null);
}
writes = [];
await service.salesService.updateOrderDetails('order', { addressStreet: 'Calle 123', customerName: 'Ana', notes: 'Tocar timbre' }, { id: 'actor' });
assert.equal(writes.find((entry) => entry.table === 'customer_addresses').payload.customer_id, null);
assert.equal(writes.find((entry) => entry.table === 'customer_addresses').payload.street, 'Calle 123');
assert.equal(writes.find((entry) => entry.table === 'orders').payload.customer_name_snapshot, 'Ana');
assert.ok(!writes.some((entry) => ['order_items', 'order_payments', 'cash_movements', 'kitchen_tickets'].includes(entry.table)));
writes = [];
await service.salesService.updateOrderPaymentMethod('order', 'tarjeta', { id: 'actor' });
assert.ok(!writes.some((entry) => entry.table === 'cash_movements'), 'Uncollected web cash must not be subtracted from the drawer');
assert.equal(writes.find((entry) => entry.table === 'orders').payload.card_type, 'debito');
console.log('PASS: ready alerts, duplicate prevention, kitchen alerts, optional identity/address, isolated quick edits, uncollected payment correction.');

// Verify the actual scheduled audio differs in timbre, melody and rhythm.
let oscillators = [];
class AudioMock {
  state = 'running'; currentTime = 0; destination = {};
  async resume() {} async close() {}
  createOscillator() {
    const oscillator = { frequency: {}, connect() {}, disconnect() {},
      start(at) { this.startedAt = at; }, stop(at) { this.stoppedAt = at; } };
    oscillators.push(oscillator);
    return oscillator;
  }
  createGain() { return { gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, disconnect() {} }; }
}
const useSound = load('src/hooks/use-order-sound.ts', {
  react: { ...react, useState: () => [false, () => {}], useCallback: (fn) => fn },
}, '', { AudioContext: AudioMock }).useOrderSound;
async function capture(kind) {
  refs = []; cursor = 0; effects = []; oscillators = [];
  const audio = useSound(kind);
  audio.play();
  assert.equal(oscillators.length, 0, 'Audio waits for activation');
  await audio.activate();
  const first = oscillators.slice();
  audio.play();
  assert.ok(oscillators[6].startedAt > first[5].stoppedAt, 'Patterns cannot overlap');
  return first;
}
const kitchenAudio = await capture('kitchen-new');
const cashAudio = await capture('cash-ready');
assert.deepEqual(kitchenAudio.map((tone) => tone.frequency.value), [784, 1046, 784, 1046, 784, 1046]);
assert.deepEqual(cashAudio.map((tone) => tone.frequency.value), [523, 659, 784, 523, 659, 784]);
assert.ok(kitchenAudio.every((tone) => tone.type === 'square'));
assert.ok(cashAudio.every((tone) => tone.type === 'sine'));
assert.notEqual(kitchenAudio[1].startedAt, cashAudio[1].startedAt);
console.log('PASS: distinct kitchen/cash timbres, melodies, rhythms, activation and non-overlapping playback.');

const { getDeliveryFee } = load('src/features/sales/lib/charges.ts', {});
assert.equal(getDeliveryFee('despacho', 0), 2000);
assert.equal(getDeliveryFee('despacho', 1000), 2000);
assert.equal(getDeliveryFee('despacho', 3000), 3000);
assert.equal(getDeliveryFee('retiro_local', 3000), 0);
assert.equal(getDeliveryFee('consumo_local', 2000), 0);
console.log('PASS: minimum dispatch fee and removal for pickup/local consumption.');
