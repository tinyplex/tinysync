/* eslint-disable no-console */
import {CellOrUndefined, createStore} from 'tinybase/store';
import {Id} from 'tinybase/common';
import {getTime} from './clock';

type CellChange = [
  time: number,
  tableId: Id,
  rowId: Id,
  cellId: Id,
  newCell: CellOrUndefined,
];
const cellChanges: CellChange[] = [];
const cellChanged = (
  _store,
  tableId: Id,
  rowId: Id,
  cellId: Id,
  newCell: CellOrUndefined,
) => cellChanges.push([getTime(), tableId, rowId, cellId, newCell]);

const store1 = createStore();
store1.addCellListener(null, null, null, cellChanged);

store1.setTables({
  pets: {fido: {species: 'dog'}, felix: {species: 'cat', legs: 4}},
});
store1.setRow('pets', 'rex', {species: 'dog'});
store1.setCell('pets', 'fido', 'price', 5);
store1.delCell('pets', 'felix', 'legs');

console.log('Original store:', store1.getTables());
console.log('Cell changes:', cellChanges);

const store2 = createStore();
cellChanges.forEach(([_time, tableId, rowId, cellId, newCell]) =>
  newCell == undefined
    ? store2.delCell(tableId, rowId, cellId)
    : store2.setCell(tableId, rowId, cellId, newCell),
);

console.log('Synced store:', store2.getTables());
