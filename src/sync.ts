/* eslint-disable no-console */
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

  const sendChangeMessages = (): ChangeMessages => {
    const messages = mapMap(
      allChanges,
      (change: Change, hlc: Hlc): ChangeMessage => [hlc, ...change],
    );
    console.log(uniqueStoreId, 'send messages', messages);
    return messages;
  };
  const receiveChangeMessages = (remoteChangeMessages: ChangeMessages) => {
    console.log(uniqueStoreId, 'receive messages', remoteChangeMessages);

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
            console.log(
              uniqueStoreId,
              'update',
              hlc,
              tableId,
              rowId,
              cellId,
              cell,
            );
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

    console.log(uniqueStoreId, 'contents', store.getTables());
  };

  const sync = {
    sendChangeMessages,
    receiveChangeMessages,
    uniqueStoreId,
  };

  return Object.freeze(sync);
};

// Will come from the TinyBase common library
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
const mapMap = <Key, Value, Return>(
  coll: Map<Key, Value> | undefined,
  cb: (value: Value, key: Key) => Return,
): Return[] =>
  arrayMap([...(coll?.entries() ?? [])], ([key, value]) => cb(value, key));
const mapSet = <Key, Value>(
  map: Map<Key, Value> | undefined,
  key: Key,
  value?: Value,
): Map<Key, Value> | undefined =>
  isUndefined(value) ? (collDel(map, key), map) : map?.set(key, value);
const arrayMap = <Value, Return>(
  array: Value[],
  cb: (value: Value, index: number, array: Value[]) => Return,
): Return[] => array.map(cb);
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
