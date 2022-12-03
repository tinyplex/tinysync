import {
  collSize,
  mapEnsure,
  mapForEach,
  mapGet,
  mapNew,
  mapSet,
} from './common';
import {Hlc} from './hlc';
import {Id} from 'tinybase/common';

type Node = Map<Id, number | Node>;

export const getTrieFunctions = (): [
  (hlc: Hlc) => void,
  () => Node,
  (smallerTrie: Node) => Hlc[],
] => {
  const root: Node = mapNew();

  const addHlc = (hlc: Hlc) => {
    const hash = getHash(hlc);
    let node = root;
    hlc.split('').forEach((char) => {
      mapSet(node, '', (mapEnsure(node, '', () => 0) as number) ^ hash);
      node = mapEnsure(node, char, mapNew) as Node;
    });
    mapSet(node, '', hash);
  };

  const getTrie = () => root;

  const getExcess = (
    smallerTrie: Node | undefined,
    largerTrie: Node = root,
    hlc = '',
    excesses: Hlc[] = [],
  ): Hlc[] => {
    if (mapGet(largerTrie, '') != mapGet(smallerTrie, '')) {
      if (collSize(largerTrie) == 1) {
        excesses.push(hlc);
      } else {
        mapForEach(largerTrie, (key, superChild) => {
          if (key != '') {
            getExcess(
              mapGet(smallerTrie, key) as Node | undefined,
              superChild as Node,
              hlc + key,
              excesses,
            );
          }
        });
      }
    }
    return excesses;
  };

  return [addHlc, getTrie, getExcess];
};

const getHash = (hlc: Hlc) => {
  let hash = 5381;
  let position = hlc.length;
  while (position) {
    hash = (hash * 33) ^ hlc.charCodeAt(--position);
  }
  return hash >>> 0;
};
