import {
  collSize,
  ifNotUndefined,
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
      [logicalTime, (++counter + '').padStart(4, '0'), uniqueId].join(','),
    );
  };

  const seenHlc = (remoteHlc?: Hlc): void => {
    const [remoteLogicalTime, remoteCounter] = ifNotUndefined(
      remoteHlc,
      (remoteHlc) => {
        const remoteLogicalTimeAndCounter = addSeenHlc(remoteHlc).split(',');
        return [
          parseInt(remoteLogicalTimeAndCounter[0]),
          parseInt(remoteLogicalTimeAndCounter[1]),
        ];
      },
      () => [0, 0],
    ) as [number, number];

    const previousLogicalTime = logicalTime;
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

const getHash = (hlc: Hlc) => {
  let hash = 5381;
  let position = hlc.length;
  while (position) {
    hash = (hash * 33) ^ hlc.charCodeAt(--position);
  }
  return hash >>> 0;
};
