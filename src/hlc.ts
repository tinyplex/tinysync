import {
  collSize,
  isUndefined,
  jsonString,
  mapEnsure,
  mapForEach,
  mapGet,
  mapKeys,
  mapNew,
  mapSet,
} from './common';
import {Id} from 'tinybase/common';

export type HlcParts = [
  logicalTime42: number,
  counter24: number,
  clientHash30: number,
];
export type Hlc = string;
// Sortable 16 digit radix-64 string of 0-9a-zA-Z{} representing 96 bits:
// - 42 bits for time in milliseconds (~139 years)
// - 24 bits for counter (~16 million)
// - 30 bits for hash of unique client id (~1 billion)

export type HlcTrieNode = Map<Id | 0, HlcTrieNode | number>;

export const getHlcFunctions = (
  uniqueId: Id,
  offset = 0,
): [
  () => Hlc,
  (remoteHlc: Hlc) => void,
  () => void,
  (smallerHlcTrieNode: HlcTrieNode) => Hlc[],
] => {
  let logicalTime = 0;
  let counter = 0;
  const uniqueIdHash = getHash(uniqueId);

  const seenHlcTrieRoot: HlcTrieNode = newNode();

  const addSeenHlc = (hlc: Hlc): Hlc => {
    const hash = getHash(hlc);
    stringReduce(
      hlc,
      (node, char) => {
        mapSet(node, 0, ((mapGet(node, 0) as number) ^ hash) >>> 0);
        return mapEnsure(node, char, newNode) as HlcTrieNode;
      },
      seenHlcTrieRoot,
    );
    return hlc;
  };

  const getHlc = (): Hlc => {
    seenHlc();
    return addSeenHlc(encodeHlc(logicalTime, ++counter, uniqueIdHash));
  };

  const seenHlc = (remoteHlc?: Hlc): void => {
    const previousLogicalTime = logicalTime;
    const [remoteLogicalTime, remoteCounter] = isUndefined(remoteHlc)
      ? [0, 0]
      : decodeHlc(addSeenHlc(remoteHlc));

    logicalTime = Math.max(
      previousLogicalTime,
      remoteLogicalTime,
      Date.now() + offset,
    );
    counter =
      logicalTime == previousLogicalTime
        ? logicalTime == remoteLogicalTime
          ? Math.max(counter, remoteCounter)
          : counter
        : logicalTime == remoteLogicalTime
        ? remoteCounter
        : -1;
  };

  const getSeenHlcs = () => {
    return seenHlcTrieRoot;
    return jsonString(shrinkNode(seenHlcTrieRoot));
  };

  const getExcessHlcs = (
    smallerNode: HlcTrieNode | undefined,
    largerNode: HlcTrieNode = seenHlcTrieRoot,
    hlc = '',
    excesses: Hlc[] = [],
  ): Hlc[] => {
    if (mapGet(largerNode, 0) != mapGet(smallerNode, 0)) {
      collSize(largerNode) == 1
        ? excesses.push(hlc)
        : nodeForEach(largerNode, (key, largerChild) =>
            getExcessHlcs(
              mapGet(smallerNode, key) as HlcTrieNode | undefined,
              largerChild,
              hlc + key,
              excesses,
            ),
          );
    }
    return excesses;
  };

  return [getHlc, seenHlc, getSeenHlcs, getExcessHlcs];
};

const stringReduce = <Return>(
  value: string,
  cb: (currentReturn: Return, char: string) => Return,
  initial: Return,
) => value.split('').reduce(cb, initial);

const getHash = (value: string): number =>
  stringReduce(
    value,
    (hash: number, char: string): number =>
      ((hash << 5) + hash) ^ char.charCodeAt(0),
    5381,
  ) >>> 0;

const SHIFT36 = 2 ** 36;
const SHIFT30 = 2 ** 30;
const SHIFT24 = 2 ** 24;
const SHIFT18 = 2 ** 18;
const SHIFT12 = 2 ** 12;
const SHIFT6 = 2 ** 6;
const MASK6 = 63;

const toB64 = (num: number): string => String.fromCharCode(48 + (num & MASK6));
const fromB64 = (str: string, pos: number): number => str.charCodeAt(pos) - 48;

const encodeHlc = (
  logicalTime42: number,
  counter24: number,
  clientHash30: number,
): Hlc =>
  toB64(logicalTime42 / SHIFT36) +
  toB64(logicalTime42 / SHIFT30) +
  toB64(logicalTime42 / SHIFT24) +
  toB64(logicalTime42 / SHIFT18) +
  toB64(logicalTime42 / SHIFT12) +
  toB64(logicalTime42 / SHIFT6) +
  toB64(logicalTime42) +
  toB64(counter24 / SHIFT18) +
  toB64(counter24 / SHIFT12) +
  toB64(counter24 / SHIFT6) +
  toB64(counter24) +
  toB64(clientHash30 / SHIFT24) +
  toB64(clientHash30 / SHIFT18) +
  toB64(clientHash30 / SHIFT12) +
  toB64(clientHash30 / SHIFT6) +
  toB64(clientHash30);

const decodeHlc = (hlc16: Hlc): HlcParts => [
  fromB64(hlc16, 0) * SHIFT36 +
    fromB64(hlc16, 1) * SHIFT30 +
    fromB64(hlc16, 2) * SHIFT24 +
    fromB64(hlc16, 3) * SHIFT18 +
    fromB64(hlc16, 4) * SHIFT12 +
    fromB64(hlc16, 5) * SHIFT6 +
    fromB64(hlc16, 6),
  fromB64(hlc16, 7) * SHIFT18 +
    fromB64(hlc16, 8) * SHIFT12 +
    fromB64(hlc16, 9) * SHIFT6 +
    fromB64(hlc16, 10),
  fromB64(hlc16, 11) * SHIFT24 +
    fromB64(hlc16, 12) * SHIFT18 +
    fromB64(hlc16, 13) * SHIFT12 +
    fromB64(hlc16, 14) * SHIFT6 +
    fromB64(hlc16, 15),
];

const newNode = (): HlcTrieNode => mapSet(mapNew(), 0, 0) as HlcTrieNode;

const nodeForEach = (
  node: HlcTrieNode,
  cb: (key: Id, child: HlcTrieNode) => void,
) =>
  mapForEach(node, (key, child) =>
    key === 0 ? 0 : cb(key, child as HlcTrieNode),
  );

const shrinkNode = (
  node: HlcTrieNode,
  key = '',
): HlcTrieNode | [key: string, node: HlcTrieNode | 1] => {
  if (collSize(node) == 1) {
    return [key, 1];
  }
  const node2 = mapSet(mapNew(), 0, mapGet(node, 0)) as HlcTrieNode;
  let lastKey = '';
  let lastChildNode: HlcTrieNode | 1 = 1;
  nodeForEach(node, (key, childNode) => {
    [lastKey, lastChildNode] = shrinkNode(childNode, key) as [
      key: string,
      node: HlcTrieNode | 1,
    ];
    mapSet(node2, lastKey, lastChildNode);
  });
  return key === ''
    ? node2
    : collSize(node2) > 2
    ? [key, node2]
    : [key + lastKey, lastChildNode];
};
