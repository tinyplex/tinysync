import {Id} from 'tinybase/common';

export type Hlc = string;

export const getHlcFunction = (
  uniqueId: Id,
  offset = 0,
): ((remoteHlc?: Hlc) => Hlc) => {
  let logicalTime = 0;
  let counter = 0;

  const getHlc = (remoteHlc: Hlc = '0,0'): Hlc => {
    const remoteLogicalTimeAndCounter = remoteHlc.split(',');
    const remoteLogicalTime = parseInt(remoteLogicalTimeAndCounter[0]);
    const remoteCounter = parseInt(remoteLogicalTimeAndCounter[1]);

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
    return [logicalTime, (++counter + '').padStart(4, '0'), uniqueId].join(',');
  };

  getHlc();
  return getHlc;
};
