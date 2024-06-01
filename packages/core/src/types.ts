export type Screenshot = {
  data: string;
  display: {
    id: number;
    name: string;
  };
};

export type RecordOptions = {
  everyMs: number;
  maxScreenshotSets?: number;
};
