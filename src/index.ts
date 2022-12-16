/* eslint-disable no-console */
import {createStore} from 'tinybase/store';
import {createSync} from './sync';
import {jsonString} from './common';

const syncFromTo = (syncFrom: any, syncTo: any) => {
  console.log(
    `\nSYNC ${syncFrom.getUniqueStoreId()} to ${syncTo.getUniqueStoreId()}`,
  );

  const currentToChanges = syncTo.getChanges();
  console.log(`REQ ${syncTo.getUniqueStoreId()}`, jsonString(currentToChanges));

  const nextToChanges = syncFrom.getChanges(currentToChanges);
  console.log(`RES ${syncFrom.getUniqueStoreId()}`, jsonString(nextToChanges));

  syncTo.setChanges(nextToChanges);
  console.log('New contents', syncTo.getStore().getTables());
};

const store1 = createStore();
const sync1 = createSync(store1, 'store1');
store1.setCell('pets', 'roger', 'species', 'cat');

const store2 = createStore();
const sync2 = createSync(store2, 'store2');
store2.setCell('pets', 'roger', 'color', 'brown');

syncFromTo(sync1, sync2);
syncFromTo(sync2, sync1);

const store3 = createStore();
const sync3 = createSync(store3, 'store3');
syncFromTo(sync1, sync3);

store3.setRow('pets', 'roger', {legs: 4});
syncFromTo(sync1, sync3);
syncFromTo(sync3, sync1);

// --

// const store0 = createStore();
// const sync0 = createSync(store0, 'store0');
// const C = 100;
// store0.transaction(() => {
//   for (let t = 0; t < C; t++) {
//     for (let r = 0; r < C; r++) {
//       for (let c = 0; c < C; c++) {
//         store0.setCell(t + '', r + '', c + '', 1);
//       }
//     }
//   }
// });
// console.log(sync0.getChanges());
// console.log(process.memoryUsage().heapUsed / 1000000);
