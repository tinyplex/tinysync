import {
  collSize,
  isUndefined,
  mapEnsure,
  mapForEach,
  mapGet,
  mapNew,
  mapSet,
} from './common';
import {Id} from 'tinybase/common';

export type Hlc = string;
// Sortable 16 digit radix-64 string of 0-9a-zA-Z{} representing 96 bits:
// - 42 bits for time in milliseconds (~139 years)
// - 24 bits for counter (~16 million)
// - 30 bits for hash of unique client id (~1 billion)

export type HlcTrieNode = Map<Id, number | HlcTrieNode>;

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

  const newNode = (): HlcTrieNode => mapSet(mapNew(), '', 0) as HlcTrieNode;

  const seenHlcTrieRoot: HlcTrieNode = newNode();

  const addSeenHlc = (hlc: Hlc): Hlc => {
    let node = seenHlcTrieRoot;
    hlc.split('').forEach((char) => {
      mapSet(node, '', ((mapGet(node, '') as number) ^ getHash(hlc)) >>> 0);
      node = mapEnsure(node, char, newNode) as HlcTrieNode;
    });
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

  const getSeenHlcs = () => seenHlcTrieRoot;

  const getExcessHlcs = (
    smallerHlcTrieNode: HlcTrieNode | undefined,
    largerHlcTrieNodeTrie: HlcTrieNode = seenHlcTrieRoot,
    hlc = '',
    excesses: Hlc[] = [],
  ): Hlc[] => {
    if (mapGet(largerHlcTrieNodeTrie, '') != mapGet(smallerHlcTrieNode, '')) {
      if (collSize(largerHlcTrieNodeTrie) == 1) {
        excesses.push(hlc);
      } else {
        mapForEach(largerHlcTrieNodeTrie, (key, superChild) => {
          if (key != '') {
            getExcessHlcs(
              mapGet(smallerHlcTrieNode, key) as HlcTrieNode | undefined,
              superChild as HlcTrieNode,
              hlc + key,
              excesses,
            );
          }
        });
      }
    }
    return excesses;
  };

  return [getHlc, seenHlc, getSeenHlcs, getExcessHlcs];
};

const getHash = (value: string): number => {
  let hash = 5381;
  let position = value.length;
  while (position) {
    hash = ((hash << 5) + hash) ^ value.charCodeAt(--position);
  }
  return hash >>> 0; // unsigned 32 bit
};

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

const decodeHlc = (hlc16: Hlc) => [
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
