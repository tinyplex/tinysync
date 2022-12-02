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
  let listening = 1;
  const cellChanges: CellChange[] = [];

  const getHlc = getHlcFunction(uniqueStoreId);

  const _listenerId = store.addCellListener(
    null,
    null,
    null,
    (_store, tableId: Id, rowId: Id, cellId: Id, newCell: CellOrUndefined) => {
      if (listening) {
        cellChanges.push([getHlc(), tableId, rowId, cellId, newCell]);
      }
    },
  );

  const getCellChanges = () => cellChanges;

  const applyCellChanges = (cellChanges: CellChanges) => {
    listening = 0;
    store.transaction(() =>
      cellChanges.forEach(([_time, tableId, rowId, cellId, newCell]) =>
        newCell == undefined
          ? store.delCell(tableId, rowId, cellId)
          : store.setCell(tableId, rowId, cellId, newCell),
      ),
    );
    listening = 1;
  };

  const sync = {
    getCellChanges,
    applyCellChanges,
  };

  return Object.freeze(sync);
};
