import assert from 'node:assert/strict';
import { buildCashDocument } from '../print-agent/cash-document.mjs';
const order = { documentType: 'receipt', store: { name: 'Local QA', phone: '123456789' }, number: 'PR-QA', createdAt: '2026-11-08T20:00:00Z', type: 'despacho', items: [{ quantity: 2, productName: 'Roll con nombre muy largo para verificar el ancho', subtotal: 9000, modifiers: [{ name: 'Agregar palta', priceDelta: 500 }] }], subtotal: 11000, deliveryFee: 2000, total: 11000, paymentMethod: 'mixto', customerPhone: '987654321' };
for (const width of [32, 48]) {
 const result = buildCashDocument(order, { charactersPerLine: width, fontSize: 'large' }).toString('ascii');
 assert.ok(result.startsWith('\x1b@\x1ba\x00\x1b!\x00'));
 assert.ok(!result.includes('\x1b!\x30'));
 assert.match(result, /Despacho: \$2\.000/);
 assert.match(result, /TOTAL: \$11\.000/);
 assert.match(result, /Tel\. local: 123456789/);
 assert.match(result, /Tel\. cliente: 987654321/);
 assert.ok(result.slice(8).split('\n').every(line => line.length <= width));
 assert.ok(!result.includes('undefined'));
}
const report = buildCashDocument({ documentType: 'cash_report', lines: ['CORTE Z', 'Texto malicioso\x1b!\x30', 'Total: $50.000'] }).toString('ascii');
assert.ok(!report.slice(8).includes('\x1b'));
assert.match(report, /CORTE Z/);
console.log('PASS: compact receipt, amounts, optional contacts, wrapping, cash reports, control-character stripping');
