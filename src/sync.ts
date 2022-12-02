import {CellOrUndefined, Store} from 'tinybase/store';
import {Id} from 'tinybase/common';
import {getHlcFunction} from './hlc';

export type CellChange = [
  hlc: string,
  tableId: Id,
  rowId: Id,
  cellId: Id,
  newCell: CellOrUndefined,
];
export type CellChanges = CellChange[];

export const createSync = (store: Store, uniqueStoreId: Id) => {
  const cellChanges: CellChange[] = [];

  const getHlc = getHlcFunction(uniqueStoreId);
  const cellChanged = (
    _store,
    tableId: Id,
    rowId: Id,
    cellId: Id,
    newCell: CellOrUndefined,
  ) => cellChanges.push([getHlc(), tableId, rowId, cellId, newCell]);

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
