/* eslint-disable no-console */
import {createStore} from 'tinybase/store';
import {createSync} from './sync';

const syncFromTo = (syncFrom: any, syncTo: any) => {
  console.log(
    '\nsync from/to',
    syncFrom.getUniqueStoreId(),
    syncTo.getUniqueStoreId(),
  );

  const seenHlcs = syncTo.getSeenHlcs();

  const messages = syncFrom.getChangeMessages(seenHlcs);
  console.log('process messages', messages);

  if (messages.length > 0) {
    syncTo.setChangeMessages(messages);
    console.log('new contents', syncTo.getStore().getTables());
  }
};

const store1 = createStore();
const sync1 = createSync(store1, 'store1', 1000);
store1.setCell('pets', 'roger', 'species', 'cat');

const store2 = createStore();
const sync2 = createSync(store2, 'store2');
store2.setCell('pets', 'roger', 'species', 'dog');

const store3 = createStore();
const sync3 = createSync(store3, 'store3');

syncFromTo(sync1, sync3);
syncFromTo(sync2, sync3);

syncFromTo(sync1, sync2);
store2.setCell('pets', 'roger', 'species', 'dog');
syncFromTo(sync1, sync3);
syncFromTo(sync2, sync3);

console.dir(sync3.getSeenHlcs(), {depth: null});

// const store0 = createStore();
// const sync0 = createSync(store0, 'store0');
// const C = 2;
// store0.transaction(() => {
//   for (let t = 0; t < C; t++) {
//     for (let r = 0; r < C; r++) {
//       for (let c = 0; c < C; c++) {
//         store0.setCell(t + '', r + '', c + '', 1);
//       }
//     }
//   }
// });
// console.dir(sync0.getSeenHlcs(), {depth: null});
// console.log(process.memoryUsage().heapUsed / 1000000);
