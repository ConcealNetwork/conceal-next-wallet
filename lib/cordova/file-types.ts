export type SaveDialog = {
  saveFile: (blob: Blob, fileName?: string) => Promise<string>;
};

export type CordovaFileWindow = Window & {
  cordova?: {
    plugins?: {
      saveDialog?: SaveDialog;
    };
  };
};
