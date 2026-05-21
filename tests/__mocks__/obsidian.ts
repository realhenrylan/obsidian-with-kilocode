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
  requestUrl: jest.fn(),
};
