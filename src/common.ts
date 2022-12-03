import {CellOrUndefined, Store} from 'tinybase/store';
import {Id} from 'tinybase/common';

// Temporarily ripped from the TinyBase common library:
export const mapNew = <Key, Value>(entries?: [Key, Value][]): Map<Key, Value> =>
  new Map(entries);
export const mapGet = <Key, Value>(
  map: Map<Key, Value> | undefined,
  key: Key,
): Value | undefined => map?.get(key);
export const mapEnsure = <Key, Value>(
  map: Map<Key, Value>,
  key: Key,
  getDefaultValue: () => Value,
): Value => {
  if (!map.has(key)) {
    map.set(key, getDefaultValue());
  }
  return map.get(key) as Value;
};
export const mapSet = <Key, Value>(
  map: Map<Key, Value> | undefined,
  key: Key,
  value?: Value,
): Map<Key, Value> | undefined =>
  isUndefined(value) ? (collDel(map, key), map) : map?.set(key, value);
export const mapKeys = <Key>(map: Map<Key, unknown> | undefined): Key[] => [
  ...(map?.keys() ?? []),
];
export const mapForEach = <Key, Value>(
  map: Map<Key, Value> | undefined,
  cb: (key: Key, value: Value) => void,
): void => collForEach(map, (value, key) => cb(key, value));
export const collForEach = <Value>(
  coll: Coll<Value> | undefined,
  cb: (value: Value, key: any) => void,
): void => coll?.forEach(cb);
export const collDel = (
  coll: Coll<unknown> | undefined,
  keyOrValue: unknown,
): boolean | undefined => coll?.delete(keyOrValue);
export const collIsEmpty = (coll: Coll<unknown> | undefined): boolean =>
  isUndefined(coll) || collSize(coll) == 0;
export const collSize = (coll: Coll<unknown>): number => coll.size;
export const isUndefined = (thing: unknown): thing is undefined | null =>
  thing == undefined;
export const setOrDelCell = (
  store: Store,
  tableId: Id,
  rowId: Id,
  cellId: Id,
  cell: CellOrUndefined,
) =>
  isUndefined(cell)
    ? store.delCell(tableId, rowId, cellId, true)
    : store.setCell(tableId, rowId, cellId, cell);
export const jsonString = (obj: unknown): string =>
  JSON.stringify(obj, (_key, value) =>
    isInstanceOf(value, Map)
      ? arrayReduce(
          [...value],
          (obj: {[key: string]: unknown}, [key, value]) => {
            obj[key] = value;
            return obj;
          },
          {},
        )
      : value,
  );
export const isInstanceOf = (
  thing: unknown,
  cls: MapConstructor | SetConstructor | ObjectConstructor,
): boolean => thing instanceof cls;
export const arrayReduce = <Value, Result>(
  array: Value[],
  cb: (previous: Result, current: Value) => Result,
  initial: Result,
): Result => array.reduce(cb, initial);
export const arrayForEach = <Value>(
  array: Value[],
  cb: (value: Value, index: number) => void,
): void => array.forEach(cb);
export const ifNotUndefined = <Value, Return>(
  value: Value | undefined,
  then: (value: Value) => Return,
  otherwise?: () => Return,
): Return | undefined => (isUndefined(value) ? otherwise?.() : then(value));

export type Coll<Value> = Map<unknown, Value> | Set<Value>;
export type IdMap<Value> = Map<Id, Value>;
export type IdMap2<Value> = IdMap<IdMap<Value>>;
export type IdMap3<Value> = IdMap<IdMap2<Value>>;
