import {
  arrayMap,
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
  const uniqueIdHash = numberToB36(getHash(uniqueId), 7);

  const seenHlcTrieRoot: HlcTrieNode = mapNew();

  const addSeenHlc = (hlc: Hlc): Hlc => {
    const hash = getHash(hlc);
    let node = seenHlcTrieRoot;
    hlc.split('').forEach((char) => {
      mapSet(node, '', (mapEnsure(node, '', () => 0) as number) ^ hash);
      node = mapEnsure(node, char, mapNew) as HlcTrieNode;
    });
    mapSet(node, '', hash);
    return hlc;
  };

  const getHlc = (): Hlc => {
    seenHlc();
    return addSeenHlc(
      [
        numberToB36(logicalTime, 8),
        numberToB36(++counter, 2),
        uniqueIdHash,
      ].join(','),
    );
  };

  const seenHlc = (remoteHlc?: Hlc): void => {
    const previousLogicalTime = logicalTime;
    const [remoteLogicalTime, remoteCounter] = isUndefined(remoteHlc)
      ? [0, 0]
      : arrayMap(addSeenHlc(remoteHlc).split(','), b36ToNumber);

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

const getHash = (hlc: Hlc): number => {
  let hash = 5381;
  let position = hlc.length;
  while (position) {
    hash = ((hash << 5) + hash) ^ hlc.charCodeAt(--position);
  }
  return hash >>> 0;
};

const numberToB36 = (number: number, pad: number) =>
  number.toString(36).padStart(pad, '0').substring(0, pad);

const b36ToNumber = (b36: string) => parseInt(b36, 36);
