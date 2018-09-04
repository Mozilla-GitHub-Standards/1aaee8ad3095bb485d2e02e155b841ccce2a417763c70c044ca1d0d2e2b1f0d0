/* global ChromeUtils, content, docShell, sendAsyncMessage */

// This will be reset on page unload.
let telemetryData = {};
let sentReload = false;

// The global "load" and "unload" event listeners listen for lifetime
// events of the framescript, hence we wait for a DOM window to appear
// and attach listeners to it. That also helps us make sure that these
// events are only forwarded once.
addEventListener("DOMContentLoaded", function(e) {
  // Ignore frames or non-web-sites.
  if (e.target.defaultView.top !== e.target.defaultView ||
      !e.target.documentURI.startsWith("http")) {
    return;
  }

  telemetryData.hostname = content.location.hostname;

  const entryForReload = content.performance.getEntriesByType("navigation")[0];
  telemetryData.pageReloaded = entryForReload.type === "reload";

  // We use the "load" event to enter the performance data, because at
  // "load" +1 tick it will contain everything we need. This means some
  // pages may end up without perf data if the user closes the tab too
  // early, but that's a tradeoff in simplicity vs. correctness we're
  // willing to take.
  content.window.addEventListener("load", () => {
    // We call setTimeout because otherwise our loadEventEnd entry (which is
    // filled after the "load" event handler runs) would be empty.
    setTimeout(function() {
      // there *should* be only one entry - I haven't see anything to the alternative yet
      const entry = content.performance.getEntriesByType("navigation")[0];
      telemetryData.performanceEvents = {
        TIME_TO_DOM_CONTENT_LOADED_START_MS: entry.domContentLoadedEventStart,
        TIME_TO_DOM_COMPLETE_MS: entry.domComplete,
        TIME_TO_DOM_INTERACTIVE_MS: entry.domInteractive,
        TIME_TO_LOAD_EVENT_START_MS: entry.loadEventStart,
        TIME_TO_LOAD_EVENT_END_MS: entry.loadEventEnd,
        TIME_TO_RESPONSE_START_MS: entry.responseStart,
        // Missing:
        // TIME_TO_NON_BLANK_PAINT_MS ( integer)
        // TIME_TO_DOM_LOADING_MS ( integer)
        // TIME_TO_FIRST_INTERACTION_MS ( integer)
      };
      if (!sentReload && telemetryData.pageReloaded) {
        sendAsyncMessage("reload", {hostname: telemetryData.hostname});
        sentReload = true;
      }
    }, 0);
  }, {once: true});

  // Listening on "unload" was giving us race conditions with the
  // tab being removed too fast, which meant we were unable to recover
  // the tabId that is associated with this data. As a compromise we
  // use the "beforeunload" event (which is a little earlier) for recording
  // and use the "unload" event (or a tab close) for submitting the data.
  content.window.addEventListener("beforeunload", () => {
    // Don't bother if we have no trackers.
    const passwordFields = content.document.querySelectorAll("input[type='password']");
    telemetryData.login_form_on_page = !!passwordFields.length;

    telemetryData.trackersFound = docShell.document.numTrackersFound;
    telemetryData.trackersBlocked = docShell.document.numTrackersBlocked;

    sendAsyncMessage("beforeunload", {telemetryData});
  }, {once: true});

  content.window.addEventListener("unload", () => {
    sendAsyncMessage("unload", {});
    telemetryData = {};
    sentReload = false;
  }, {once: true});
});

// Listen for errors from the content.
addEventListener("error", function(e) {
  // TODO should we handle these somehow?
  if (!e.error) {
    return;
  }

  sendAsyncMessage("pageError", e.error.name);
});
