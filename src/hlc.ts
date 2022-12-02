import {Id} from 'tinybase/common';

export const getHlcFunction = (uniqueId: Id) => {
  let logicalTime = 0;
  let counter = 0;

  const getHlc = (remoteHlc = '0,0') => {
    const remoteLogicalTimeAndCounter = remoteHlc.split(',');
    const remoteLogicalTime = parseInt(remoteLogicalTimeAndCounter[0]);
    const remoteCounter = parseInt(remoteLogicalTimeAndCounter[1]);

    const previousLogicalTime = logicalTime;
    logicalTime = Math.max(previousLogicalTime, remoteLogicalTime, Date.now());
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
