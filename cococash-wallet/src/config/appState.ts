let isShuttingDown = false;

export const setShuttingDown = () => {
  isShuttingDown = true;
};

export const getShuttingDown = () => isShuttingDown;