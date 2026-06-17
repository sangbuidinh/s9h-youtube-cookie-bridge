"use strict";

const statusText = document.getElementById("statusText");
const lastExportTime = document.getElementById("lastExportTime");
const openCookieFileButton = document.getElementById("openCookieFileButton");
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
const INSTALL_HINT = "Native Host chưa kết nối. Hãy chạy native/install_bridge.cmd, rồi tải lại tiện ích.";
const EXPORT_BUSY_MESSAGE = "Another cookie export is still running. Try again in a few seconds.";
const EXPORT_BUSY_MESSAGE_VI = "Một lần xuất cookie khác vẫn đang chạy. Hãy thử lại sau vài giây.";
const AUTO_EXPORT_STATUS_LABELS = Object.freeze({
  enabled: "Đang bật",
  disabled: "Đang tắt",
  scheduled: "Đã lên lịch",
  queued: "Đang chờ",
  exporting: "Đang xuất",
  success: "Đã xuất",
  error: "Lỗi"
});

function setBusy(isBusy) {
  exportButton.disabled = isBusy;
  pingButton.disabled = isBusy;
}

function setStatus(message, state) {
  statusText.textContent = message;
  statusText.dataset.state = state || "neutral";
}

function setNativeHostError(message) {
  nativeHostStatus.textContent = "Chưa kết nối";
  setStatus(message || INSTALL_HINT, "error");
}

function translateMessage(message) {
  const value = String(message || "");
  const translations = {
    "Unsupported request.": "Yêu cầu không được hỗ trợ.",
    "Unknown request.": "Yêu cầu không xác định.",
    "Native host is not available.": "Native Host chưa sẵn sàng.",
    "Native host returned an empty response.": "Native Host trả về phản hồi trống.",
    "Could not contact extension background worker.": "Không thể liên hệ nền tiện ích.",
    "Could not update auto export.": "Không thể cập nhật tự động xuất.",
    "Auto export failed.": "Tự động xuất thất bại.",
    "Cookie file not found.": "Chưa có file cookie đã lưu.",
    "Could not open cookie file location.": "Không mở được vị trí file cookie.",
    "Opening cookie file location is only supported on Windows.": "Chỉ hỗ trợ mở vị trí file cookie trên Windows.",
    "Unexpected error.": "Lỗi không xác định."
  };

  if (value === EXPORT_BUSY_MESSAGE) {
    return EXPORT_BUSY_MESSAGE_VI;
  }
  return translations[value] || value;
}

function nativeHostErrorMessage(response) {
  if (response && response.error) {
    if (response.error === EXPORT_BUSY_MESSAGE) {
      return EXPORT_BUSY_MESSAGE_VI;
    }
    return translateMessage(response.error) + " " + INSTALL_HINT;
  }
  return INSTALL_HINT;
}

function setCookieFileButtonEnabled(enabled) {
  openCookieFileButton.disabled = enabled !== true;
}

function formatTime(value) {
  if (!value) {
    return "Chưa có";
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

async function refreshCookieFileStatus() {
  try {
    const response = await sendAction("get_cookie_file_status");
    setCookieFileButtonEnabled(Boolean(response && response.ok && response.exists));
  } catch (error) {
    setCookieFileButtonEnabled(false);
  }
}

function renderAutoExportState(state) {
  const enabled = state.autoExportEnabled === true;
  const status = state.lastAutoExportStatus || (enabled ? "enabled" : "disabled");
  const error = state.lastAutoExportError || "";

  autoExportCheckbox.checked = enabled;
  autoExportStatus.textContent = AUTO_EXPORT_STATUS_LABELS[enabled ? status : "disabled"] || status;
  autoExportError.textContent = translateMessage(error);
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
    nativeHostStatus.textContent = state.lastNativeHostStatus === "connected" ? "Đã kết nối" : "Chưa kết nối";
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
    copyIdStatus.textContent = "Đã sao chép.";
  } catch (error) {
    copyIdStatus.textContent = "Không sao chép được. Hãy sao chép ID thủ công.";
  }
}

async function testNativeHost() {
  setBusy(true);
  setStatus("Đang kiểm tra Native Host...", "neutral");

  try {
    const response = await sendAction("ping_host");
    if (response && response.ok) {
      nativeHostStatus.textContent = "Đã kết nối";
      setStatus("Native Host đã kết nối.", "success");
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
  setStatus("Đang xuất cookie...", "neutral");

  try {
    const response = await sendAction("export_youtube_cookies");
    if (response && response.ok) {
      const updatedAt = response.updated_at || new Date().toISOString();
      const count = Number(response.cookie_count || 0);
      lastExportTime.textContent = formatTime(updatedAt);
      cookieCount.textContent = String(count);
      nativeHostStatus.textContent = "Đã kết nối";
      setCookieFileButtonEnabled(true);
      setStatus("Xuất cookie thành công.", "success");
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
  setStatus(enabled ? "Đang bật tự động xuất..." : "Đang tắt tự động xuất...", "neutral");

  try {
    const response = await sendAction("set_auto_export_enabled", { enabled: enabled });
    if (response && response.ok) {
      renderAutoExportState({
        autoExportEnabled: response.autoExportEnabled,
        lastAutoExportStatus: response.lastAutoExportStatus,
        lastAutoExportError: ""
      });
      setStatus(enabled ? "Đã bật tự động xuất." : "Đã tắt tự động xuất.", "success");
      return;
    }

    autoExportCheckbox.checked = !enabled;
    setStatus(response && response.error ? translateMessage(response.error) : "Không thể cập nhật tự động xuất.", "error");
  } catch (error) {
    autoExportCheckbox.checked = !enabled;
    setStatus("Không thể cập nhật tự động xuất.", "error");
  } finally {
    autoExportCheckbox.disabled = false;
  }
}

async function openCookieFileLocation() {
  openCookieFileButton.disabled = true;

  try {
    const response = await sendAction("open_cookie_file_location");
    if (response && response.ok) {
      setCookieFileButtonEnabled(true);
      nativeHostStatus.textContent = "Đã kết nối";
      setStatus("Đã mở vị trí file cookie.", "success");
      return;
    }

    await refreshCookieFileStatus();
    const isMissing = response && response.error_code === "cookie_file_missing";
    setStatus(isMissing ? "Chưa có file cookie đã lưu." : "Không mở được vị trí file cookie.", "error");
  } catch (error) {
    await refreshCookieFileStatus();
    setStatus("Không mở được vị trí file cookie.", "error");
  }
}

document.addEventListener("DOMContentLoaded", function () {
  loadExtensionId();
  loadState();
  refreshCookieFileStatus();
  copyIdButton.addEventListener("click", copyExtensionId);
  pingButton.addEventListener("click", testNativeHost);
  exportButton.addEventListener("click", exportCookies);
  openCookieFileButton.addEventListener("click", openCookieFileLocation);
  autoExportCheckbox.addEventListener("change", toggleAutoExport);
});

chrome.storage.onChanged.addListener(function (changes, areaName) {
  if (areaName !== "local") {
    return;
  }

  if (
    changes.lastExportTime ||
    changes.lastCookieCount ||
    changes.lastNativeHostStatus ||
    changes.autoExportEnabled ||
    changes.lastAutoExportStatus ||
    changes.lastAutoExportError
  ) {
    loadState();
  }

  if (changes.lastExportTime || changes.lastWrittenTo) {
    refreshCookieFileStatus();
  }
});
