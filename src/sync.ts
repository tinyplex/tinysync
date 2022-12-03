import {CellOrUndefined, Store} from 'tinybase/store';
import {Hlc, getHlcFunctions} from './hlc';
import {
  IdMap2,
  IdMap3,
  arrayForEach,
  isUndefined,
  mapEnsure,
  mapGet,
  mapNew,
  mapSet,
  setOrDelCell,
} from './common';
import {Id} from 'tinybase/common';

export type Change = [
  tableId: Id,
  rowId: Id,
  cellId: Id,
  cell: CellOrUndefined,
];
export type Changes = Map<Hlc, Change>;
export type ChangeMessage = [Hlc, ...Change];
export type ChangeMessages = ChangeMessage[];

export const createSync = (store: Store, uniqueStoreId: Id, offset = 0) => {
  let listening = 1;

  const [getHlc, seenHlc, getSeenHlcs, getExcessHlcs] = getHlcFunctions(
    uniqueStoreId,
    offset,
  );

  const allChanges: Changes = mapNew();
  const latestChangeHlcs: IdMap3<Hlc> = mapNew();

  const getChangeMessages = (seenHlcs: any): ChangeMessages => {
    const messages: ChangeMessages = [];
    arrayForEach(getExcessHlcs(seenHlcs), (hlc: Hlc) => {
      messages.push([hlc, ...(mapGet(allChanges, hlc) as Change)]);
    });
    return messages;
  };

  const setChangeMessages = (remoteChangeMessages: ChangeMessages) => {
    listening = 0;
    store.transaction(() =>
      remoteChangeMessages.forEach(([hlc, tableId, rowId, cellId, cell]) =>
        mapEnsure(allChanges, hlc, () => {
          seenHlc(hlc);
          const latestChangeHlc = mapGet(
            mapGet(mapGet(latestChangeHlcs, tableId), rowId),
            cellId,
          );
          if (isUndefined(latestChangeHlc) || hlc > latestChangeHlc) {
            setOrDelCell(store, tableId, rowId, cellId, cell);
            mapSet(
              mapEnsure(
                mapEnsure<Id, IdMap2<Hlc>>(latestChangeHlcs, tableId, mapNew),
                rowId,
                mapNew,
              ),
              cellId,
              hlc,
            );
          }
          return [tableId, rowId, cellId, cell];
        }),
      ),
    );
    listening = 1;
  };

  const getUniqueStoreId = () => uniqueStoreId;

  const getStore = () => store;

  const sync = {
    getSeenHlcs,
    getChangeMessages,
    setChangeMessages,
    getUniqueStoreId,
    getStore,
  };

  store.addCellListener(
    null,
    null,
    null,
    (_store, tableId: Id, rowId: Id, cellId: Id, cell: CellOrUndefined) =>
      listening
        ? mapSet(allChanges, getHlc(), [tableId, rowId, cellId, cell])
        : 0,
  );

  return Object.freeze(sync);
};
