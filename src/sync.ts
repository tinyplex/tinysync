import {CellOrUndefined, Store} from 'tinybase/store';
import {Hlc, getHlcFunctions} from './hlc';
import {
  IdMap2,
  IdMap3,
  arrayForEach,
  arrayPush,
  collClear,
  collIsEmpty,
  ifNotUndefined,
  isUndefined,
  mapEnsure,
  mapForEach,
  mapGet,
  mapNew,
  mapSet,
  setOrDelCell,
  stringReduce,
} from './common';
import {Id} from 'tinybase/common';

export type Change = [
  tableId: Id,
  rowId: Id,
  cellId: Id,
  cell: CellOrUndefined,
];
export type Changes = Map<Hlc, Change>;

type ChangeNode = Map<string, ChangeNode | Change>;
const nodeNew = (): ChangeNode => mapNew() as ChangeNode;

const nodeForEach = (
  node: ChangeNode | undefined,
  cb: (key: Id, child: ChangeNode | Change) => void,
) => mapForEach(node, (key, child) => cb(key, child as ChangeNode));

const addLeaf = (node: ChangeNode, hlc: Hlc, change: Change) =>
  stringReduce(
    hlc,
    (node, char, index) =>
      mapEnsure(node, char, index < 15 ? nodeNew : () => change) as ChangeNode,
    node,
  );

const getDiff = (
  largerNode: ChangeNode,
  smallerNode: ChangeNode | undefined,
  depth = 15,
  diffNode: ChangeNode = nodeNew(),
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
  depth = 15,
  path = '',
): [Hlc, Change][] => {
  nodeForEach(node, (key, child) => {
    depth
      ? getLeaves(child as ChangeNode, leaves, depth - 1, path + key)
      : arrayPush(leaves, [path + key, child as Change]);
  });
  return leaves;
};

export const createSync = (store: Store, uniqueStoreId: Id, offset = 0) => {
  let listening = 1;

  const [getLocalHlc, seenRemoteHlc] = getHlcFunctions(uniqueStoreId, offset);

  const undigestedChanges: Map<Hlc, Change> = mapNew();
  const allChanges: ChangeNode = nodeNew();
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
      addLeaf(allChanges, hlc, change),
    );
    collClear(undigestedChanges);
  };

  const getChanges = (except?: ChangeNode): ChangeNode | undefined => {
    digestChanges();
    return getDiff(allChanges, except);
  };

  const setChanges = (changes: ChangeNode) => {
    digestChanges();
    listening = 0;
    store.transaction(() => {
      arrayForEach(
        getLeaves(getDiff(changes, allChanges)),
        ([hlc, [tableId, rowId, cellId, cell]]) => {
          seenRemoteHlc(hlc);
          if (handleChange(hlc, tableId, rowId, cellId, cell)) {
            setOrDelCell(store, tableId, rowId, cellId, cell);
          }
        },
      );
    });
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
