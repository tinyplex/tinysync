/* eslint-disable no-console */
import {createStore} from 'tinybase/store';
import {createSync} from './sync';

const store1 = createStore();
const sync1 = createSync(store1, 'store1');

store1.setTables({
  pets: {fido: {species: 'dog'}, felix: {species: 'cat', legs: 4}},
});
store1.setRow('pets', 'rex', {species: 'dog'});
store1.setCell('pets', 'fido', 'price', 5);
store1.delCell('pets', 'felix', 'legs');

console.log('Original store:', store1.getTables());

const store2 = createStore();
const sync2 = createSync(store2, 'store2');

const cellChanges = sync1.getCellChanges();
console.log('Cell changes', cellChanges);

sync2.applyCellChanges(cellChanges);

console.log('Synced store:', store2.getTables());
