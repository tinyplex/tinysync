import {fromB64, getHash, isUndefined, toB64} from './common';
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

const SHIFT36 = 2 ** 36;
const SHIFT30 = 2 ** 30;
const SHIFT24 = 2 ** 24;
const SHIFT18 = 2 ** 18;
const SHIFT12 = 2 ** 12;
const SHIFT6 = 2 ** 6;

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

export const getHlcFunctions = (
  uniqueId: Id,
  offset = 0,
): [() => Hlc, (remoteHlc: Hlc) => void] => {
  let logicalTime = 0;
  let counter = 0;
  const uniqueIdHash = getHash(uniqueId);

  const getLocalHlc = (): Hlc => {
    seenRemoteHlc();
    return encodeHlc(logicalTime, ++counter, uniqueIdHash);
  };

  const seenRemoteHlc = (remoteHlc?: Hlc): void => {
    const previousLogicalTime = logicalTime;
    const [remoteLogicalTime, remoteCounter] = isUndefined(remoteHlc)
      ? [0, 0]
      : decodeHlc(remoteHlc);

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

  return [getLocalHlc, seenRemoteHlc];
};
