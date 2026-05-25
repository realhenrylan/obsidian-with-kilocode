/* eslint-disable @typescript-eslint/no-extraneous-class */
/* eslint-disable @typescript-eslint/no-unsafe-return */

class MockModal {
  app: any;
  scope: any;
  constructor(app: any) {
    this.app = app;
  }
  open() { return this; }
  close() {}
  onOpen() {}
  onClose() {}
}

class MockApp {
  workspace = {
    getActiveViewOfType: jest.fn(),
    getLeavesOfType: jest.fn().mockReturnValue([]),
    getRightLeaf: jest.fn().mockReturnValue(null),
    revealLeaf: jest.fn(),
  };
  vault = {
    adapter: null,
    getRoot: jest.fn().mockReturnValue({ path: '/' }),
  };
}

const MockSetting = class {
  setName() { return this; }
  setDesc() { return this; }
  addText() { return this; }
  addToggle() { return this; }
  addDropdown() { return this; }
  addSlider() { return this; }
  addExtraButton() { return this; }
};

class MockPluginSettingTab {}
class MockItemView {}
class MockWorkspaceLeaf {}

class MockNotice {
  message: string;
  constructor(message: string, _timeout?: number) {
    this.message = message;
  }
}

module.exports = {
  Plugin: class Plugin {
    app: any;
    manifest: any;
    constructor(app?: any, manifest?: any) {
      this.app = app ?? new MockApp();
      this.manifest = manifest ?? { dir: '.' };
    }
  },
  Setting: MockSetting,
  PluginSettingTab: MockPluginSettingTab,
  ItemView: MockItemView,
  WorkspaceLeaf: MockWorkspaceLeaf,
  Notice: MockNotice,
  Modal: MockModal,
  App: MockApp,
  Component: class Component {
    load() {}
    register() {}
    unload() {}
    registerEvent() {}
    registerDomEvent() {}
    registerInterval() {}
  },
  MarkdownRenderer: class MarkdownRenderer {
    static render() {}
  },
  TFile: class TFile {},
  MarkdownView: class MarkdownView {},
  FileSystemAdapter: class FileSystemAdapter {
    getBasePath() { return '/mock/vault'; }
  },
  requestUrl: jest.fn(),
  Platform: {
    isDesktop: true,
    isMobile: false,
  },
};
