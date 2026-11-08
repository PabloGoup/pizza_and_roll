import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { buildCashDocument } from '../print-agent/cash-document.mjs';
const order = { documentType: 'receipt', store: { name: 'Local QA', phone: '123456789' }, number: 'PR-QA', createdAt: '2026-11-08T20:00:00Z', type: 'despacho', items: [{ quantity: 2, productName: 'Roll con nombre muy largo para verificar el ancho', subtotal: 9000, modifiers: [{ name: 'Agregar palta', priceDelta: 500 }] }], subtotal: 11000, deliveryFee: 2000, total: 11000, paymentMethod: 'mixto', customerPhone: '987654321', deliveryAddress: { street: 'Direccion QA 123', district: 'Comuna QA' }, status: 'listo', source: 'whatsapp', cashierName: 'Cajero QA' };
for (const width of [32, 48]) {
 const result = buildCashDocument(order, { charactersPerLine: width, fontSize: 'large' }).toString('ascii');
 assert.ok(result.startsWith('\x1b@\x1ba\x00\x1b!\x00'));
 assert.ok(!result.includes('\x1b!\x30'));
 assert.match(result, /Despacho: \$2\.000/);
 assert.match(result, /TOTAL: \$11\.000/);
 assert.match(result, /Tel\. local: 123456789/);
 assert.match(result, /Tel\. cliente: 987654321/);
 assert.ok(result.replaceAll('\n',' ').includes('Entrega: Direccion QA 123, Comuna QA'));
 assert.doesNotMatch(result, /Cajero QA|Consumo en local|Retiro en local|TIPO:|CANAL:|ESTADO:|CAJERO:/i);
 assert.ok(result.slice(8).split('\n').every(line => line.length <= width));
 assert.ok(!result.includes('undefined'));
}
const report = buildCashDocument({ documentType: 'cash_report', lines: ['CORTE Z', 'Texto malicioso\x1b!\x30', 'Total: $50.000'] }).toString('ascii');
assert.ok(!report.slice(8).includes('\x1b'));
assert.match(report, /CORTE Z/);
console.log('PASS: compact receipt, amounts, optional contacts, wrapping, cash reports, control-character stripping');

const withoutContact = buildCashDocument({ ...order, customerPhone: null, deliveryAddress: null }).toString('ascii');
assert.doesNotMatch(withoutContact, /Tel\. cliente:|Entrega:|Ref:/);

// Manual/browser receipts must include snapshot-only customer contacts as well.
const imports = {
  '@/features/storefront/lib/store-contact': { STORE_CONTACT: { address: 'Local QA', phoneLabel: '111' } },
  '@/lib/format': { formatCurrency: value => `$${value}`, formatDateTime: () => 'Fecha QA',
    orderStatusLabel: () => 'Listo', orderTypeLabel: () => 'Consumo en local', paymentMethodLabel: () => 'Efectivo' },
  '@/features/sales/lib/charges': { summarizeKitchenModifiers: () => ({ visibleModifiers: [], changeQuantity: 0 }) },
};
const sandbox = { exports: {}, require: name => {
  if (!(name in imports)) throw new Error(`Unexpected import ${name}`);
  return imports[name];
} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/features/sales/lib/order-print.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, sandbox);
const manualOrder = { ...order, items: [], extraCharges: [], customer: null,
  customerPhoneSnapshot: ' 999888777 ', customerNameSnapshot: 'Cliente QA',
  cashierName: 'Cajero QA', discountAmount: 0, promotionAmount: 0,
  deliveryAddress: { street: '<Direccion QA>', district: 'Comuna QA' } };
const html = sandbox.exports.buildOrderPrintMarkup(manualOrder, 'ticket');
assert.match(html, /Tel\. cliente: 999888777/);
assert.match(html, /&lt;Direccion QA&gt;/);
assert.doesNotMatch(html, /<span>(Tipo|Estado|Cajero|Canal)<\/span>|Cajero QA|Consumo en local/);
const noContacts = sandbox.exports.buildOrderPrintMarkup({ ...manualOrder,
  customerPhoneSnapshot: null, customerNameSnapshot: null, deliveryAddress: {} }, 'ticket');
assert.doesNotMatch(noContacts, /Tel\. cliente:|Dirección de entrega/);
const fallback = sandbox.exports.buildOrderPrintMarkup({ ...manualOrder,
  customerPhoneSnapshot: ' ', customer: { fullName: 'Cliente', phone: '555444333' } }, 'ticket');
assert.match(fallback, /Tel\. cliente: 555444333/);
console.log('PASS customer receipt: metadata omitted, snapshot/customer phone fallback, optional address, HTML escaping');
