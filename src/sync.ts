import {CellOrUndefined, Store} from 'tinybase/store';
import {Hlc, getHlcFunctions} from './hlc';
import {
  IdMap2,
  IdMap3,
  arrayForEach,
  collClear,
  isUndefined,
  mapEnsure,
  mapForEach,
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
export type ChangeDigest = string; //[Hlc, ...Change][];

export const createSync = (store: Store, uniqueStoreId: Id, offset = 0) => {
  let listening = 1;

  const [getLocalHlc, seenRemoteHlc] = getHlcFunctions(uniqueStoreId, offset);

  const undigestedChanges: Changes = mapNew();
  const digestedChanges: Changes = mapNew();
  const latestHlcsByCell: IdMap3<Hlc> = mapNew();

  const handleChange = (
    hlc: Hlc,
    tableId: Id,
    rowId: Id,
    cellId: Id,
    cell: CellOrUndefined,
  ): 0 | 1 => {
    mapSet(undigestedChanges, hlc, [tableId, rowId, cellId, cell]);
    const latestHlcByCell = mapGet(
      mapGet(mapGet(latestHlcsByCell, tableId), rowId),
      cellId,
    );
    if (isUndefined(latestHlcByCell) || hlc > latestHlcByCell) {
      mapSet(
        mapEnsure(
          mapEnsure<Id, IdMap2<Hlc>>(latestHlcsByCell, tableId, mapNew),
          rowId,
          mapNew,
        ),
        cellId,
        hlc,
      );
      return 1;
    }
    return 0;
  };

  const getChanges = (except?: ChangeDigest): ChangeDigest => {
    mapForEach(undigestedChanges, (hlc, change) =>
      mapSet(digestedChanges, hlc, change),
    );
    collClear(undigestedChanges);

    const exceptHlcs = new Set();
    arrayForEach(JSON.parse(except ?? '[]') as [Hlc, ...Change][], ([hlc]) =>
      exceptHlcs.add(hlc),
    );

    const messages: [Hlc, ...Change][] = [];
    mapForEach(digestedChanges, (hlc, change) => {
      if (!exceptHlcs.has(hlc)) {
        messages.push([hlc, ...change]);
      }
    });
    return JSON.stringify(messages);
  };

  const setChanges = (changes: ChangeDigest) => {
    listening = 0;
    store.transaction(() =>
      JSON.parse(changes).forEach(([hlc, tableId, rowId, cellId, cell]) => {
        seenRemoteHlc(hlc);
        if (handleChange(hlc, tableId, rowId, cellId, cell)) {
          setOrDelCell(store, tableId, rowId, cellId, cell);
        }
      }),
    );
    listening = 1;
  };

  const getUniqueStoreId = () => uniqueStoreId;

  const getStore = () => store;

  const sync = {
    getChanges,
    setChanges,
    getUniqueStoreId,
    getStore,
  };

  store.addCellListener(
    null,
    null,
    null,
    (_store, tableId: Id, rowId: Id, cellId: Id, cell: CellOrUndefined) =>
      listening ? handleChange(getLocalHlc(), tableId, rowId, cellId, cell) : 0,
  );

  return Object.freeze(sync);
};
