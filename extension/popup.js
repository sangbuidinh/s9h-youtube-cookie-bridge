"use strict";

const statusText = document.getElementById("statusText");
const lastExportTime = document.getElementById("lastExportTime");
const cookieCount = document.getElementById("cookieCount");
const nativeHostStatus = document.getElementById("nativeHostStatus");
const exportButton = document.getElementById("exportButton");
const pingButton = document.getElementById("pingButton");
const extensionIdText = document.getElementById("extensionIdText");
const copyIdButton = document.getElementById("copyIdButton");
const copyIdStatus = document.getElementById("copyIdStatus");
const autoExportCheckbox = document.getElementById("autoExportCheckbox");
const autoExportStatus = document.getElementById("autoExportStatus");
const autoExportError = document.getElementById("autoExportError");
const INSTALL_HINT = "Native host not connected. Run install_bridge.cmd in the project folder, then reload the extension.";
const EXPORT_BUSY_MESSAGE = "Another cookie export is still running. Try again in a few seconds.";

function setBusy(isBusy) {
  exportButton.disabled = isBusy;
  pingButton.disabled = isBusy;
}

function setStatus(message, state) {
  statusText.textContent = message;
  statusText.dataset.state = state || "neutral";
}

function setNativeHostError(message) {
  nativeHostStatus.textContent = "Error";
  setStatus(message || INSTALL_HINT, "error");
}

function nativeHostErrorMessage(response) {
  if (response && response.error) {
    if (response.error === EXPORT_BUSY_MESSAGE) {
      return response.error;
    }
    return response.error + " " + INSTALL_HINT;
  }
  return INSTALL_HINT;
}

function formatTime(value) {
  if (!value) {
    return "Never";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

function sendAction(action, payload) {
  return new Promise(function (resolve, reject) {
    chrome.runtime.sendMessage(Object.assign({ action: action }, payload || {}), function (response) {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message || "Could not contact extension background worker."));
        return;
      }
      resolve(response);
    });
  });
}

function renderAutoExportState(state) {
  const enabled = state.autoExportEnabled === true;
  const status = state.lastAutoExportStatus || (enabled ? "enabled" : "disabled");
  const error = state.lastAutoExportError || "";

  autoExportCheckbox.checked = enabled;
  autoExportStatus.textContent = enabled ? status : "disabled";
  autoExportError.textContent = error;
  autoExportError.hidden = !error;
}

function loadState() {
  chrome.storage.local.get([
    "lastExportTime",
    "lastCookieCount",
    "lastNativeHostStatus",
    "autoExportEnabled",
    "lastAutoExportStatus",
    "lastAutoExportError"
  ], function (state) {
    lastExportTime.textContent = formatTime(state.lastExportTime);
    cookieCount.textContent = String(state.lastCookieCount || 0);
    nativeHostStatus.textContent = state.lastNativeHostStatus || "Unknown";
    renderAutoExportState(state);
  });
}

function loadExtensionId() {
  extensionIdText.textContent = chrome.runtime.id || "Unknown";
}

async function copyExtensionId() {
  const extensionId = chrome.runtime.id || "";
  copyIdStatus.textContent = "";

  try {
    if (!navigator.clipboard || !navigator.clipboard.writeText) {
      throw new Error("Clipboard API is not available.");
    }

    await navigator.clipboard.writeText(extensionId);
    copyIdStatus.textContent = "Copied.";
  } catch (error) {
    copyIdStatus.textContent = "Copy failed. Copy the ID manually.";
  }
}

async function testNativeHost() {
  setBusy(true);
  setStatus("Testing native host...", "neutral");

  try {
    const response = await sendAction("ping_host");
    if (response && response.ok) {
      nativeHostStatus.textContent = "Connected";
      setStatus("Native host connected.", "success");
      return;
    }

    setNativeHostError(nativeHostErrorMessage(response));
  } catch (error) {
    setNativeHostError(INSTALL_HINT);
  } finally {
    setBusy(false);
  }
}

async function exportCookies() {
  setBusy(true);
  setStatus("Exporting cookies...", "neutral");

  try {
    const response = await sendAction("export_youtube_cookies");
    if (response && response.ok) {
      const updatedAt = response.updated_at || new Date().toISOString();
      const count = Number(response.cookie_count || 0);
      lastExportTime.textContent = formatTime(updatedAt);
      cookieCount.textContent = String(count);
      nativeHostStatus.textContent = "Connected";
      setStatus("Export completed.", "success");
      return;
    }

    setNativeHostError(nativeHostErrorMessage(response));
  } catch (error) {
    setNativeHostError(INSTALL_HINT);
  } finally {
    setBusy(false);
  }
}

async function toggleAutoExport() {
  const enabled = autoExportCheckbox.checked;
  autoExportCheckbox.disabled = true;
  setStatus(enabled ? "Enabling auto export..." : "Disabling auto export...", "neutral");

  try {
    const response = await sendAction("set_auto_export_enabled", { enabled: enabled });
    if (response && response.ok) {
      renderAutoExportState({
        autoExportEnabled: response.autoExportEnabled,
        lastAutoExportStatus: response.lastAutoExportStatus,
        lastAutoExportError: ""
      });
      setStatus(enabled ? "Auto export enabled." : "Auto export disabled.", "success");
      return;
    }

    autoExportCheckbox.checked = !enabled;
    setStatus(response && response.error ? response.error : "Could not update auto export.", "error");
  } catch (error) {
    autoExportCheckbox.checked = !enabled;
    setStatus("Could not update auto export.", "error");
  } finally {
    autoExportCheckbox.disabled = false;
  }
}

document.addEventListener("DOMContentLoaded", function () {
  loadExtensionId();
  loadState();
  copyIdButton.addEventListener("click", copyExtensionId);
  pingButton.addEventListener("click", testNativeHost);
  exportButton.addEventListener("click", exportCookies);
  autoExportCheckbox.addEventListener("change", toggleAutoExport);
});
