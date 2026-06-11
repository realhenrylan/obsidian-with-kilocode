// Obsidian polyfills for HTMLElement
if (typeof HTMLElement !== 'undefined') {
  HTMLElement.prototype.setCssStyles = function (this: HTMLElement, styles: Partial<CSSStyleDeclaration>) {
    Object.assign(this.style, styles);
  };
  HTMLElement.prototype.setCssProps = function (this: HTMLElement, _props: Record<string, string>) {
    // no-op in test
  };
}

/** TAbstractFile base */
class TAbstractFile {
  name: string;
  path: string;
  constructor(name: string, path: string) {
    this.name = name;
    this.path = path;
  }
}

/** File */
class TFile extends TAbstractFile {
  basename: string;
  extension: string;
  constructor(name: string, path: string) {
    super(name, path);
    const dot = name.lastIndexOf('.');
    this.basename = dot >= 0 ? name.slice(0, dot) : name;
    this.extension = dot >= 0 ? name.slice(dot + 1) : '';
  }
}

/** Folder */
class TFolder extends TAbstractFile {
  children: (TFile | TFolder)[] = [];
  constructor(name: string, path: string) {
    super(name, path);
  }
}

module.exports = {
  Plugin: class Plugin {},
  Setting: class Setting {
    setName() { return this; }
    setDesc() { return this; }
    setHeading() { return this; }
    addText() { return this; }
    addToggle() { return this; }
    addDropdown() { return this; }
    addSlider() { return this; }
    addButton() { return this; }
    addExtraButton() { return this; }
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
  TFile,
  TFolder,
  requestUrl: jest.fn(),
};
