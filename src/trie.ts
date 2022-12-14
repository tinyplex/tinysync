import {collSize, mapForEach, mapGet, mapNew, mapSet} from './common';
import {Id} from 'tinybase/common';

export type HlcTrieNode = Map<Id | 0, HlcTrieNode | number>;

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
