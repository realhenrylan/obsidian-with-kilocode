module.exports = {
  Plugin: class Plugin {},
  Setting: class Setting {
    setName() { return this; }
    setDesc() { return this; }
    addText() { return this; }
    addToggle() { return this; }
    addDropdown() { return this; }
    addSlider() { return this; }
  },
  PluginSettingTab: class PluginSettingTab {},
  ItemView: class ItemView {},
  WorkspaceLeaf: class WorkspaceLeaf {},
  Notice: class Notice {
    message: string;
    constructor(message: string, _timeout?: number) {
      this.message = message;
    }
  },
  requestUrl: jest.fn(),
};
