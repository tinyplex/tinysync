import {CellOrUndefined, Store} from 'tinybase/store';
import {Hlc, getHlcFunction} from './hlc';
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

  const allChanges: Changes = mapNew();
  const latestChangeHlcs: IdMap3<Hlc> = mapNew();

  const getHlc = getHlcFunction(uniqueStoreId, offset);

  const getSeenHlcs = (): Hlc[] => mapKeys(allChanges);

  const getChangeMessages = (seenHlcs: Hlc[] = []): ChangeMessages => {
    const messages: ChangeMessages = [];
    mapForEach(allChanges, (hlc: Hlc, change: Change) =>
      // clearly this is not going to scale
      seenHlcs.includes(hlc) ? 0 : messages.push([hlc, ...change]),
    );
    return messages;
  };

  const setChangeMessages = (remoteChangeMessages: ChangeMessages) => {
    listening = 0;
    store.transaction(() =>
      remoteChangeMessages.forEach(([hlc, tableId, rowId, cellId, cell]) =>
        mapEnsure(allChanges, hlc, () => {
          getHlc(hlc);
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
    (_store, tableId: Id, rowId: Id, cellId: Id, cell: CellOrUndefined) => {
      if (listening) {
        allChanges.set(getHlc(), [tableId, rowId, cellId, cell]);
      }
    },
  );

  return Object.freeze(sync);
};

// Temporarily ripped from the TinyBase common library:
const mapNew = <Key, Value>(entries?: [Key, Value][]): Map<Key, Value> =>
  new Map(entries);
const mapGet = <Key, Value>(
  map: Map<Key, Value> | undefined,
  key: Key,
): Value | undefined => map?.get(key);
const mapEnsure = <Key, Value>(
  map: Map<Key, Value>,
  key: Key,
  getDefaultValue: () => Value,
): Value => {
  if (!map.has(key)) {
    map.set(key, getDefaultValue());
  }
  return map.get(key) as Value;
};
const mapSet = <Key, Value>(
  map: Map<Key, Value> | undefined,
  key: Key,
  value?: Value,
): Map<Key, Value> | undefined =>
  isUndefined(value) ? (collDel(map, key), map) : map?.set(key, value);
const mapKeys = <Key>(map: Map<Key, unknown> | undefined): Key[] => [
  ...(map?.keys() ?? []),
];
const mapForEach = <Key, Value>(
  map: Map<Key, Value> | undefined,
  cb: (key: Key, value: Value) => void,
): void => collForEach(map, (value, key) => cb(key, value));
const collForEach = <Value>(
  coll: Coll<Value> | undefined,
  cb: (value: Value, key: any) => void,
): void => coll?.forEach(cb);
const collDel = (
  coll: Coll<unknown> | undefined,
  keyOrValue: unknown,
): boolean | undefined => coll?.delete(keyOrValue);
const isUndefined = (thing: unknown): thing is undefined | null =>
  thing == undefined;
const setOrDelCell = (
  store: Store,
  tableId: Id,
  rowId: Id,
  cellId: Id,
  cell: CellOrUndefined,
) =>
  isUndefined(cell)
    ? store.delCell(tableId, rowId, cellId, true)
    : store.setCell(tableId, rowId, cellId, cell);
type Coll<Value> = Map<unknown, Value> | Set<Value>;
type IdMap<Value> = Map<Id, Value>;
type IdMap2<Value> = IdMap<IdMap<Value>>;
type IdMap3<Value> = IdMap<IdMap2<Value>>;
