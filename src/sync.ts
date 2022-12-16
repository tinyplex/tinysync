import {CellOrUndefined, Store} from 'tinybase/store';
import {Hlc, getHlcFunctions} from './hlc';
import {
  IdMap2,
  IdMap3,
  arrayForEach,
  arrayPush,
  arrayReduce,
  collClear,
  collIsEmpty,
  ifNotUndefined,
  isObject,
  isUndefined,
  jsonString,
  mapEnsure,
  mapForEach,
  mapGet,
  mapNew,
  mapSet,
  setOrDelCell,
  stringSplit,
} from './common';
import {Id} from 'tinybase/common';

export type ChangesMessage = [stringTable: string[], json: string];

const MAX_DEPTH = 7;

type Change = [tableId: Id, rowId: Id, cellId: Id, cell: CellOrUndefined];
type ChangeNode = Map<string, ChangeNode | Change>;

const addLeaf = (node: ChangeNode, hlc: Hlc, change: Change) =>
  arrayReduce(
    stringSplit(hlc, '', MAX_DEPTH).concat(hlc.substring(MAX_DEPTH)),
    (node, char, index) =>
      mapEnsure(
        node,
        char,
        index < MAX_DEPTH ? mapNew : () => change,
      ) as ChangeNode,
    node,
  );

const getDiff = (
  largerNode: ChangeNode,
  smallerNode: ChangeNode,
  depth = MAX_DEPTH,
  diffNode: ChangeNode = mapNew(),
): ChangeNode | undefined => {
  mapForEach(largerNode, (key, largerChild) => {
    ifNotUndefined(
      mapGet(smallerNode, key) as ChangeNode,
      (smallerChild) =>
        depth
          ? mapSet(
              diffNode,
              key,
              getDiff(largerChild as ChangeNode, smallerChild, depth - 1),
            )
          : 0,
      () => mapSet(diffNode, key, largerChild),
    );
  });
  return collIsEmpty(diffNode) ? undefined : diffNode;
};

const getLeaves = (
  node: ChangeNode | undefined,
  leaves: [Hlc, Change][] = [],
  depth = MAX_DEPTH,
  path = '',
): [Hlc, Change][] => {
  mapForEach(node, (key, child) => {
    depth
      ? getLeaves(child as ChangeNode, leaves, depth - 1, path + key)
      : arrayPush(leaves, [path + key, child as Change]);
  });
  return leaves;
};

const encode = (changeNode: ChangeNode | undefined): ChangesMessage => [
  [],
  jsonString(changeNode ?? {}),
];

const decodeChanges = (changes?: ChangesMessage): ChangeNode =>
  JSON.parse(changes?.[1] ?? '{}', (key, value) => {
    if (isObject(value)) {
      const map = mapNew();
      Object.entries(value).forEach(([k, v]) => mapSet(map, k, v));
      return map;
    }
    return value;
  });

export const createSync = (store: Store, uniqueStoreId: Id, offset = 0) => {
  let listening = 1;

  const [getHlc, seenHlc] = getHlcFunctions(uniqueStoreId, offset);

  const undigestedChanges: Map<Hlc, Change> = mapNew();
  const rootChangeNode: ChangeNode = mapNew();
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

  const digestChanges = () => {
    mapForEach(undigestedChanges, (hlc, change) =>
      addLeaf(rootChangeNode, hlc, change),
    );
    collClear(undigestedChanges);
  };

  const getChanges = (except?: ChangesMessage): ChangesMessage => {
    digestChanges();
    return encode(getDiff(rootChangeNode, decodeChanges(except)));
  };

  const setChanges = (changes: ChangesMessage) => {
    digestChanges();
    listening = 0;
    store.transaction(() =>
      arrayForEach(
        getLeaves(getDiff(decodeChanges(changes), rootChangeNode)),
        ([hlc, [tableId, rowId, cellId, cell]]) => {
          seenHlc(hlc);
          if (handleChange(hlc, tableId, rowId, cellId, cell)) {
            setOrDelCell(store, tableId, rowId, cellId, cell);
          }
        },
      ),
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
      listening ? handleChange(getHlc(), tableId, rowId, cellId, cell) : 0,
  );

  return Object.freeze(sync);
};
