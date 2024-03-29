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
} from './common';
import {Id} from 'tinybase/common';

export type Changes = string; //[stringTable: string[], json: string];

const TREE_DEPTH = 3;

type Change = [tableId: Id, rowId: Id, cellId: Id, cell: CellOrUndefined];
type ChangeNode = Map<string, ChangeNode | Change>;

const addLeaf = (node: ChangeNode, hlc: Hlc, change: Change) =>
  arrayReduce(
    [
      hlc.substring(0, 3),
      hlc.substring(3, 7),
      hlc.substring(7, 11),
      hlc.substring(11),
    ],
    (node, fragment, index) =>
      mapEnsure(
        node,
        fragment,
        index < TREE_DEPTH ? mapNew : () => change,
      ) as ChangeNode,
    node,
  );

const getDiff = (
  largerNode: ChangeNode,
  smallerNode: ChangeNode,
  depth = TREE_DEPTH,
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
  depth = TREE_DEPTH,
  path = '',
): [Hlc, Change][] => {
  mapForEach(node, (key, child) => {
    depth
      ? getLeaves(child as ChangeNode, leaves, depth - 1, path + key)
      : arrayPush(leaves, [path + key, child as Change]);
  });
  return leaves;
};

const encode = (changeNode: ChangeNode | undefined): Changes => {
  if (isUndefined(changeNode)) {
    return '';
  }
  return jsonString(changeNode);
};

const decode = (changes: Changes): ChangeNode =>
  JSON.parse(changes == '' ? '{}' : changes, (key, value) => {
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

  const getChanges = (except: Changes = ''): Changes => {
    digestChanges();
    return encode(getDiff(rootChangeNode, decode(except)));
  };

  const setChanges = (changes: Changes) => {
    digestChanges();
    listening = 0;
    store.transaction(() =>
      arrayForEach(
        getLeaves(getDiff(decode(changes), rootChangeNode)),
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
