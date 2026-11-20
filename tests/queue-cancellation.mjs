import assert from 'node:assert/strict';
import { synchronizeCancellations } from '../print-agent/queue-cancellation.mjs';
const credentials = { p_agent_name: 'qa', p_agent_token: 'secret' };
const requests = [{ id: 'a', printerName: 'Caja', jobIds: null }, { id: 'b', printerName: 'Caja', jobIds: ['job'] }];
const events = [];
const rpc = async (name, args) => {
  assert.equal(args.p_agent_token, credentials.p_agent_token);
  if (name === 'poll_print_cancellations') return requests;
  events.push(['ack', args.p_request_id, args.p_error]);
};
assert.equal(await synchronizeCancellations({ rpc, credentials, cancel: async r => events.push(['cancel', r.id]), log: async () => {} }), true);
assert.deepEqual(events, [['cancel','a'],['ack','a',null],['cancel','b'],['ack','b',null]]);
events.length = 0;
assert.equal(await synchronizeCancellations({ rpc, credentials, cancel: async () => { throw new Error('spooler unavailable'); }, log: async () => {} }), false);
assert.deepEqual(events, [['ack','a','spooler unavailable'],['ack','b','spooler unavailable']]);
// Never continue printing if the acknowledgement cannot be persisted.
await assert.rejects(synchronizeCancellations({ credentials, rpc: async name => {
  if (name === 'poll_print_cancellations') return [requests[0]];
  throw new Error('connection lost');
}, cancel: async () => {}, log: async () => {} }), /connection lost/);
// A later full cleanup must still run if an earlier individual request failed.
let legacy = true;
const pending = new Map([['single', {id:'single',jobIds:['old']}], ['all', {id:'all',jobIds:null}]]);
const recover = {
  credentials,
  rpc: async (name,args) => {
    if (name === 'poll_print_cancellations') return [...pending.values()];
    if (!args.p_error) pending.delete(args.p_request_id);
  },
  cancel: async r => {
    if (r.jobIds && legacy) throw new Error('Use full cleanup');
    if (!r.jobIds) legacy = false;
  },
  log: async () => {},
};
assert.equal(await synchronizeCancellations(recover),false);
assert.equal(legacy,false);
assert.equal(await synchronizeCancellations(recover),true);
assert.equal(pending.size,0);
console.log('PASS: serial OS cancellation, errors block printing, acknowledgement must persist');
