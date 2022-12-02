/* eslint-disable no-console */
import {CellChanges, createSync} from './sync';
import {createStore} from 'tinybase/store';

const server: CellChanges = [];

const store1 = createStore();
const sync1 = createSync(store1, 'store1');
store1.setTables({
  pets: {fido: {species: 'dog'}, felix: {species: 'cat', legs: 4, furry: true}},
});
store1.setRow('pets', 'rex', {species: 'dog'});
store1.setCell('pets', 'fido', 'price', 5);
store1.delCell('pets', 'felix', 'legs');
const cellChanges1 = sync1.getCellChanges();
server.push(...cellChanges1);
console.log('Store 1', store1.getTables(), cellChanges1);

const store2 = createStore();
const sync2 = createSync(store2, 'store2');
store2.setTables({
  pets: {cujo: {species: 'wolf'}, felix: {species: 'cat', purrs: true}},
});
const cellChanges2 = sync2.getCellChanges();
server.push(...cellChanges2);
console.log('Store 2', store2.getTables(), cellChanges2);

const store3 = createStore();
const sync3 = createSync(store3, 'store3');
sync3.applyCellChanges(server);
console.log('Server', server);
console.log('Store 3', store3.getTables());
