// Plain ESC/POS text: customer receipts always use the compact printer font.
export function buildCashDocument(document, { charactersPerLine = 32, feedLines = 6 } = {}) {
  const width = Math.max(16, Math.min(64, Number(charactersPerLine) || 32));
  const clean = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7e]/g, ' ').trim();
  const lines = [];
  const add = value => {
    const text = clean(value);
    const words = text.split(/\s+/);
    let row = '';
    for (let word of words) {
      if (row && row.length + word.length + 1 > width) { lines.push(row); row = ''; }
      while (word.length > width) { lines.push(word.slice(0, width)); word = word.slice(width); }
      row = row ? `${row} ${word}` : word;
    }
    if (row) lines.push(row);
  };
  const money = value => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(Number(value ?? 0));
  const amount = (label, value) => add(`${label}: ${money(value)}`);
  if (document.documentType === 'cash_report') {
    for (const entry of document.lines ?? []) add(entry);
  } else {
    add(document.store?.name || 'Pizza and Roll');
    if (document.store?.address) add(document.store.address);
    if (document.store?.phone) add(`Tel. local: ${document.store.phone}`);
    add('DETALLE DEL PEDIDO');
    add(document.number);
    add(new Intl.DateTimeFormat('es-CL', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Santiago' }).format(new Date(document.createdAt)));
    if (document.customerName) add(`Cliente: ${document.customerName}`);
    if (document.customerPhone?.trim()) add(`Tel. cliente: ${document.customerPhone}`);
    const deliveryAddress = document.deliveryAddress;
    const deliveryLocation = [deliveryAddress?.street, deliveryAddress?.district]
      .map(value => value?.trim()).filter(Boolean).join(', ');
    if (deliveryLocation) add(`Entrega: ${deliveryLocation}`);
    if (deliveryAddress?.reference?.trim()) add(`Ref: ${deliveryAddress.reference}`);
    add('-'.repeat(width));
    for (const item of document.items ?? []) {
      add(`${item.quantity} x ${item.productName}`);
      if (item.variantName) add(item.variantName);
      for (const mod of item.modifiers ?? []) add(`+ ${mod.name}${mod.priceDelta ? ` (${money(mod.priceDelta)})` : ''}`);
      if (item.notes) add(`Obs: ${item.notes}`);
      amount('Importe', item.subtotal);
    }
    add('-'.repeat(width));
    amount('Productos', (document.items ?? []).reduce((sum, item) => sum + Number(item.subtotal), 0));
    if (document.type === 'despacho' || document.deliveryFee) amount('Despacho', document.deliveryFee);
    for (const charge of document.extraCharges ?? []) amount(`${charge.name} x${charge.quantity}`, charge.total);
    amount('Subtotal', document.subtotal);
    if (document.discountAmount) amount('Descuento', document.discountAmount);
    if (document.promotionAmount) amount('Promocion', document.promotionAmount);
    if (document.tipAmount) amount('Propina', document.tipAmount);
    amount('TOTAL', document.total);
    add(`Pago: ${{ efectivo: 'Efectivo', tarjeta: 'Tarjeta', transferencia: 'Transferencia', mixto: 'Mixto' }[document.paymentMethod] || document.paymentMethod}`);
    if (document.notes) add(`Obs: ${document.notes}`);
    add('Gracias por su compra');
  }
  return Buffer.from('\x1b@\x1ba\x00\x1b!\x00' + lines.join('\n') + '\n'.repeat(feedLines), 'ascii');
}
