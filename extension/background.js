"use strict";

importScripts("cookie_export.js", "native_bridge.js");

const AUTO_EXPORT_ALARM_NAME = "s9h_auto_export_youtube_cookies";
const AUTO_EXPORT_DELAY_MINUTES = 0.5;
const AUTO_EXPORT_ERROR_COOLDOWN_MS = 5 * 60 * 1000;
const MAX_AUTO_EXPORT_ERROR_LENGTH = 300;
const MANUAL_EXPORT_WAIT_TIMEOUT_MS = 15 * 1000;
const MANUAL_EXPORT_BUSY_MESSAGE = "Another cookie export is still running. Try again in a few seconds.";

let activeExportPromise = null;
let autoExportInProgress = false;
let autoExportQueued = false;

function storageGet(keys) {
  return new Promise(function (resolve, reject) {
    chrome.storage.local.get(keys, function (values) {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message || "Could not read local state."));
        return;
      }
      resolve(values || {});
    });
  });
}

function storageSet(values) {
  return new Promise(function (resolve, reject) {
    chrome.storage.local.set(values, function () {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message || "Could not update local state."));
        return;
      }
      resolve();
    });
  });
}

function alarmCreate(name, alarmInfo) {
  return new Promise(function (resolve, reject) {
    chrome.alarms.create(name, alarmInfo, function () {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message || "Could not schedule auto export."));
        return;
      }
      resolve();
    });
  });
}

function alarmClear(name) {
  return new Promise(function (resolve, reject) {
    chrome.alarms.clear(name, function () {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message || "Could not clear auto export alarm."));
        return;
      }
      resolve();
    });
  });
}

function safeErrorMessage(error) {
  if (!error || !error.message) {
    return "Unexpected error.";
  }
  return String(error.message);
}

function sanitizeAutoExportError(error) {
  const message = safeErrorMessage(error)
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim() || "Auto export failed.";
  return message.length > MAX_AUTO_EXPORT_ERROR_LENGTH
    ? message.slice(0, MAX_AUTO_EXPORT_ERROR_LENGTH - 3).trimEnd() + "..."
    : message;
}

function nowIsoString() {
  return new Date().toISOString();
}

function delay(ms) {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms);
  });
}

async function isAutoExportEnabled() {
  const state = await storageGet(["autoExportEnabled"]);
  return state.autoExportEnabled === true;
}

async function isAutoExportErrorCooldownActive() {
  const state = await storageGet(["lastAutoExportErrorTime"]);
  const lastErrorTime = Date.parse(state.lastAutoExportErrorTime || "");
  return Number.isFinite(lastErrorTime) && Date.now() - lastErrorTime < AUTO_EXPORT_ERROR_COOLDOWN_MS;
}

async function recordAutoExportStatus(status) {
  await storageSet({
    lastAutoExportStatus: status
  });
}

async function recordAutoExportError(error) {
  await storageSet({
    lastAutoExportStatus: "error",
    lastAutoExportError: sanitizeAutoExportError(error),
    lastAutoExportErrorTime: nowIsoString(),
    lastNativeHostStatus: "error"
  });
}

async function scheduleAutoExportAlarm() {
  if (!(await isAutoExportEnabled())) {
    return false;
  }
  if (await isAutoExportErrorCooldownActive()) {
    return false;
  }

  await alarmCreate(AUTO_EXPORT_ALARM_NAME, {
    delayInMinutes: AUTO_EXPORT_DELAY_MINUTES
  });
  await recordAutoExportStatus("scheduled");
  return true;
}

async function scheduleQueuedAutoExportIfNeeded() {
  if (!autoExportQueued) {
    return;
  }

  autoExportQueued = false;
  await scheduleAutoExportAlarm();
}

function isAllowedChangedCookie(changeInfo) {
  return Boolean(
    changeInfo &&
    changeInfo.cookie &&
    self.S9HYoutubeCookieExport.isAllowedCookieDomain(changeInfo.cookie.domain)
  );
}

function nativeExportAction(kind) {
  return kind === "auto" ? "auto_export" : "manual_export";
}

async function runNativeCookieExport(kind) {
  const collected = await self.S9HYoutubeCookieExport.collectYoutubeCookies();
  const response = await self.S9HNativeBridge.sendMessageToNativeHost(
    self.S9HNativeBridge.buildExportMessage(collected.cookies, nativeExportAction(kind))
  );

  const now = nowIsoString();
  await storageSet({
    lastExportTime: response.ok ? now : null,
    lastCookieCount: response.ok ? response.cookie_count || collected.summary.count : 0,
    lastNativeHostStatus: response.ok ? "connected" : "error",
    lastWrittenTo: response.ok ? response.written_to || "" : ""
  });

  if (!response.ok) {
    return response;
  }

  return Object.assign({}, response, {
    collected_cookie_count: collected.summary.count
  });
}

async function waitForActiveExport(timeoutMs) {
  const startedAt = Date.now();

  while (activeExportPromise) {
    const remainingMs = typeof timeoutMs === "number"
      ? timeoutMs - (Date.now() - startedAt)
      : null;
    if (remainingMs !== null && remainingMs <= 0) {
      throw new Error(MANUAL_EXPORT_BUSY_MESSAGE);
    }

    try {
      if (remainingMs === null) {
        await activeExportPromise;
      } else {
        const waitResult = await Promise.race([
          activeExportPromise.then(
            function () {
              return "settled";
            },
            function () {
              return "settled";
            }
          ),
          delay(remainingMs).then(function () {
            return "timeout";
          })
        ]);

        if (waitResult === "timeout" && activeExportPromise) {
          throw new Error(MANUAL_EXPORT_BUSY_MESSAGE);
        }
      }
    } catch (error) {
      if (error && error.message === MANUAL_EXPORT_BUSY_MESSAGE) {
        throw error;
      }
      // The caller only needs to wait until the current export settles.
    }
  }
}

async function runExportWithLock(kind) {
  await waitForActiveExport(kind === "manual" ? MANUAL_EXPORT_WAIT_TIMEOUT_MS : undefined);

  const promise = runNativeCookieExport(kind);
  activeExportPromise = promise;
  if (kind === "auto") {
    autoExportInProgress = true;
  }

  try {
    return await promise;
  } finally {
    if (activeExportPromise === promise) {
      activeExportPromise = null;
    }
    if (kind === "auto") {
      autoExportInProgress = false;
    }
  }
}

async function pingHost() {
  const response = await self.S9HNativeBridge.sendMessageToNativeHost(
    self.S9HNativeBridge.buildPingMessage()
  );

  await storageSet({
    lastNativeHostStatus: response.ok ? "connected" : "error"
  });

  return response;
}

async function getCookieFileStatus() {
  const response = await self.S9HNativeBridge.sendMessageToNativeHost(
    self.S9HNativeBridge.buildCookieFileStatusMessage()
  );

  await storageSet({
    lastNativeHostStatus: response.ok ? "connected" : "error"
  });

  return response;
}

async function openCookieFileLocation() {
  const response = await self.S9HNativeBridge.sendMessageToNativeHost(
    self.S9HNativeBridge.buildOpenCookieFileLocationMessage()
  );

  await storageSet({
    lastNativeHostStatus: response.ok ? "connected" : "error"
  });

  return response;
}

async function exportYoutubeCookies() {
  try {
    return await runExportWithLock("manual");
  } finally {
    await scheduleQueuedAutoExportIfNeeded();
  }
}

async function runAutoExportFromAlarm() {
  if (!(await isAutoExportEnabled())) {
    autoExportQueued = false;
    await recordAutoExportStatus("disabled");
    return;
  }

  if (activeExportPromise) {
    autoExportQueued = true;
    await recordAutoExportStatus("queued");
    return;
  }

  await recordAutoExportStatus("exporting");

  try {
    const response = await runExportWithLock("auto");
    if (!(await isAutoExportEnabled())) {
      autoExportQueued = false;
      await recordAutoExportStatus("disabled");
      return;
    }

    if (!response || !response.ok) {
      autoExportQueued = false;
      await recordAutoExportError(new Error(response && response.error ? response.error : "Auto export failed."));
      return;
    }

    await storageSet({
      lastAutoExportStatus: "success",
      lastAutoExportError: "",
      lastAutoExportErrorTime: null
    });
    await scheduleQueuedAutoExportIfNeeded();
  } catch (error) {
    if (!(await isAutoExportEnabled())) {
      autoExportQueued = false;
      await recordAutoExportStatus("disabled");
      return;
    }

    autoExportQueued = false;
    await recordAutoExportError(error);
  }
}

async function handleCookieChanged(changeInfo) {
  if (!isAllowedChangedCookie(changeInfo)) {
    return;
  }
  if (!(await isAutoExportEnabled())) {
    return;
  }

  if (activeExportPromise || autoExportInProgress) {
    autoExportQueued = true;
    await recordAutoExportStatus("queued");
    return;
  }

  await scheduleAutoExportAlarm();
}

async function setAutoExportEnabled(enabled) {
  const isEnabled = enabled === true;

  if (!isEnabled) {
    autoExportQueued = false;
    await alarmClear(AUTO_EXPORT_ALARM_NAME);
    await storageSet({
      autoExportEnabled: false,
      lastAutoExportStatus: "disabled",
      lastAutoExportError: "",
      lastAutoExportErrorTime: null
    });
    return {
      ok: true,
      autoExportEnabled: false,
      lastAutoExportStatus: "disabled"
    };
  }

  await storageSet({
    autoExportEnabled: true,
    lastAutoExportStatus: "enabled",
    lastAutoExportError: "",
    lastAutoExportErrorTime: null
  });
  return {
    ok: true,
    autoExportEnabled: true,
    lastAutoExportStatus: "enabled"
  };
}

async function handlePopupMessage(message) {
  if (!message || typeof message.action !== "string") {
    return {
      ok: false,
      error: "Unknown request."
    };
  }

  if (message.action === "ping_host") {
    return pingHost();
  }

  if (message.action === "export_youtube_cookies") {
    return exportYoutubeCookies();
  }

  if (message.action === "set_auto_export_enabled") {
    return setAutoExportEnabled(message.enabled === true);
  }

  if (message.action === "get_cookie_file_status") {
    return getCookieFileStatus();
  }

  if (message.action === "open_cookie_file_location") {
    return openCookieFileLocation();
  }

  return {
    ok: false,
    error: "Unsupported request."
  };
}

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  handlePopupMessage(message)
    .then(function (response) {
      sendResponse(response);
    })
    .catch(function (error) {
      sendResponse({
        ok: false,
        error: safeErrorMessage(error)
      });
    });

  return true;
});

chrome.cookies.onChanged.addListener(function (changeInfo) {
  handleCookieChanged(changeInfo)
    .catch(function (error) {
      return recordAutoExportError(error);
    });
});

chrome.alarms.onAlarm.addListener(function (alarm) {
  if (!alarm || alarm.name !== AUTO_EXPORT_ALARM_NAME) {
    return;
  }

  runAutoExportFromAlarm()
    .catch(function (error) {
      return recordAutoExportError(error);
    });
});
