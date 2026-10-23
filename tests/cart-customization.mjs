import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { webcrypto } from 'node:crypto';
const source=fs.readFileSync(new URL('../src/features/sales/lib/cart-customization.ts',import.meta.url),'utf8');
const sandbox={exports:{},crypto:webcrypto};
vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,sandbox);
const {splitCustomizedCartItem}=sandbox.exports;
const palta={id:'palta',name:'Agregar palta',priceDelta:500};
const wrap={id:'wrapping:handroll:frito',name:'Envoltura: Frito',priceDelta:0};
const replacement={id:'sold-out-replacement-0',name:'Cambio por agotado: Pepino -> Pollo',priceDelta:0};
const base={id:'original',productId:'handroll',productName:'Hand Roll Tori',categoryName:'Hand Roll',quantity:3,unitPrice:3000,notes:'Salsa aparte',modifiers:[wrap,replacement,palta]};
const total=items=>items.reduce((sum,item)=>sum+(item.unitPrice+item.modifiers.reduce((n,m)=>n+m.priceDelta,0))*item.quantity,0);
const rows=splitCustomizedCartItem(base,1);
assert.equal(rows.length,2);
assert.equal(rows[0].quantity,1);
assert.equal(rows[1].quantity,2);
assert.equal(rows[0].id,'original');
assert.notEqual(rows[0].id,rows[1].id);
assert.equal(total(rows),9500);
assert.equal(rows[1].modifiers.some(m=>m.id==='palta'),false);
assert.equal(rows[1].modifiers.length,2);
assert.equal(rows[1].notes,'Salsa aparte');
assert.equal(base.quantity,3);
assert.equal(base.modifiers.length,3);
assert.equal(total(splitCustomizedCartItem(base,2)),10000);
assert.equal(total(splitCustomizedCartItem(base,3)),10500);
assert.equal(total(splitCustomizedCartItem(base)),10500); // Existing selections retain their original scope.
assert.equal(splitCustomizedCartItem({...base,modifiers:[wrap,replacement]},1).length,1);
assert.equal(total(splitCustomizedCartItem({...base,modifiers:[{...palta,quantity:2,priceDelta:1000}]},1)),10000);
for(const q of [0,4,1.5,NaN]) assert.throws(()=>splitCustomizedCartItem(base,q));
// Both checkout and printing multiply per-unit modifiers by each row's quantity.
// Serialized rows therefore preserve one extra and three products across the full flow.
const persisted=JSON.parse(JSON.stringify(rows));
assert.equal(persisted.reduce((sum,item)=>sum+item.quantity,0),3);
assert.equal(persisted.reduce((sum,item)=>sum+item.quantity*item.modifiers.filter(m=>m.id==='palta').length,0),1);
console.log('PASS cart customization: single/two/all units, preserved legacy scope, totals, wrapping/replacements, IDs and serialized kitchen quantities.');
