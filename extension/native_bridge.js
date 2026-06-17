"use strict";

const NATIVE_HOST_NAME = "com.s9h.youtube_downloader.cookies";
const BRIDGE_SOURCE = "s9h-youtube-cookie-bridge";
const BRIDGE_MESSAGE_VERSION = 1;

function sendMessageToNativeHost(message) {
  return new Promise(function (resolve, reject) {
    chrome.runtime.sendNativeMessage(NATIVE_HOST_NAME, message, function (response) {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message || "Native host is not available."));
        return;
      }
      if (!response) {
        reject(new Error("Native host returned an empty response."));
        return;
      }
      resolve(response);
    });
  });
}

function buildPingMessage() {
  return {
    type: "ping",
    version: BRIDGE_MESSAGE_VERSION,
    source: BRIDGE_SOURCE
  };
}

function buildExportMessage(cookies) {
  return {
    type: "export_youtube_cookies",
    version: BRIDGE_MESSAGE_VERSION,
    source: BRIDGE_SOURCE,
    created_at: new Date().toISOString(),
    cookies: cookies
  };
}

function buildCookieFileStatusMessage() {
  return {
    type: "getCookieFileStatus",
    version: BRIDGE_MESSAGE_VERSION,
    source: BRIDGE_SOURCE
  };
}

function buildOpenCookieFileLocationMessage() {
  return {
    type: "openCookieFileLocation",
    version: BRIDGE_MESSAGE_VERSION,
    source: BRIDGE_SOURCE
  };
}

self.S9HNativeBridge = {
  NATIVE_HOST_NAME: NATIVE_HOST_NAME,
  BRIDGE_SOURCE: BRIDGE_SOURCE,
  BRIDGE_MESSAGE_VERSION: BRIDGE_MESSAGE_VERSION,
  sendMessageToNativeHost: sendMessageToNativeHost,
  buildPingMessage: buildPingMessage,
  buildExportMessage: buildExportMessage,
  buildCookieFileStatusMessage: buildCookieFileStatusMessage,
  buildOpenCookieFileLocationMessage: buildOpenCookieFileLocationMessage
};
