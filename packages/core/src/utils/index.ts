export const delay = (ms: number) =>
  new Promise((resolve) => setTimeout(() => resolve(null), ms));

export const logger = {
  debug: (...strings: any[]) => {
    if (!process.env["LOCAL_RECALL_DEBUG"]) return;
    console.log(...strings);
  },
};
