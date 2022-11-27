import {CellOrUndefined, Store} from 'tinybase/store';
import {Id} from 'tinybase/common';
import {getTime} from './clock';

export type CellChange = [
  time: number,
  tableId: Id,
  rowId: Id,
  cellId: Id,
  newCell: CellOrUndefined,
];
export type CellChanges = CellChange[];

export const createSync = (store: Store) => {
  const cellChanges: CellChange[] = [];
  const cellChanged = (
    _store,
    tableId: Id,
    rowId: Id,
    cellId: Id,
    newCell: CellOrUndefined,
  ) => cellChanges.push([getTime(), tableId, rowId, cellId, newCell]);

  store.addCellListener(null, null, null, cellChanged);
  const sync = {
    getCellChanges: () => cellChanges,
    applyCellChanges: (cellChanges: CellChanges) =>
      cellChanges.forEach(([_time, tableId, rowId, cellId, newCell]) =>
        newCell == undefined
          ? store.delCell(tableId, rowId, cellId)
          : store.setCell(tableId, rowId, cellId, newCell),
      ),
  };

  return Object.freeze(sync);
};
