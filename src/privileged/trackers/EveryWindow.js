/* globals Services */

this.EveryWindow = {
  _callbacks: new Map(),
  _initialized: false,

  registerCallback: function EW_registerCallback(id, init, uninit) {
    if (this._callbacks.has(id)) {
      return;
    }

    this._callForEveryWindow(init);
    this._callbacks.set(id, {id, init, uninit});

    if (!this._initialized) {
      Services.obs.addObserver(this._onOpenWindow.bind(this),
        "browser-delayed-startup-finished");
      this._initialized = true;
    }
  },

  unregisterCallback: function EW_unregisterCallback(aId, aCallUninit = true) {
    if (!this._callbacks.has(aId)) {
      return;
    }

    if (aCallUninit) {
      this._callForEveryWindow(this._callbacks.get(aId).uninit);
    }

    this._callbacks.delete(aId);
  },

  _callForEveryWindow(aFunction) {
    const windowList = Services.wm.getEnumerator("navigator:browser");
    while (windowList.hasMoreElements()) {
      const win = windowList.getNext();
      win.delayedStartupPromise.then(() => { aFunction(win); });
    }
  },

  _onOpenWindow(aWindow) {
    for (const c of this._callbacks.values()) {
      c.init(aWindow);
    }

    aWindow.addEventListener("unload",
      this._onWindowClosing.bind(this), { once: true });
  },

  _onWindowClosing(aEvent) {
    const win = aEvent.target;
    for (const c of this._callbacks.values()) {
      c.uninit(win);
    }
  },
};
