"use strict";

const YOUTUBE_COOKIE_DOMAINS = Object.freeze([
  ".youtube.com",
  "youtube.com",
  "www.youtube.com",
  "music.youtube.com",
  ".youtube-nocookie.com",
  "youtube-nocookie.com",
  ".google.com",
  "google.com",
  ".googlevideo.com",
  "googlevideo.com"
]);

const ALLOWED_COOKIE_ROOTS = Object.freeze([
  "youtube.com",
  "youtube-nocookie.com",
  "google.com",
  "googlevideo.com"
]);

function chromeCookieGetAll(details) {
  return new Promise(function (resolve, reject) {
    chrome.cookies.getAll(details, function (cookies) {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message || "Could not read browser cookies."));
        return;
      }
      resolve(Array.isArray(cookies) ? cookies : []);
    });
  });
}

function stripLeadingDot(domain) {
  return String(domain || "").trim().replace(/^\.+/, "").toLowerCase();
}

function ensurePath(path) {
  const value = String(path || "/").trim() || "/";
  return value.startsWith("/") ? value : "/" + value;
}

function stablePartitionKey(partitionKey) {
  if (!partitionKey) {
    return "";
  }

  try {
    const sorted = {};
    Object.keys(partitionKey).sort().forEach(function (key) {
      sorted[key] = partitionKey[key];
    });
    return JSON.stringify(sorted);
  } catch (error) {
    return String(partitionKey);
  }
}

function cookieDedupeKey(cookie) {
  return [
    cookie.storeId || "",
    String(cookie.domain || "").trim().toLowerCase(),
    ensurePath(cookie.path),
    cookie.name || "",
    stablePartitionKey(cookie.partitionKey)
  ].join("\n");
}

function isAllowedCookieDomain(domain) {
  const clean = stripLeadingDot(domain);
  if (!clean) {
    return false;
  }

  return ALLOWED_COOKIE_ROOTS.some(function (root) {
    return clean === root || clean.endsWith("." + root);
  });
}

function pickCookieFields(cookie) {
  const result = {
    domain: cookie.domain || "",
    hostOnly: Boolean(cookie.hostOnly),
    path: ensurePath(cookie.path),
    secure: Boolean(cookie.secure),
    httpOnly: Boolean(cookie.httpOnly),
    sameSite: cookie.sameSite || "unspecified",
    session: Boolean(cookie.session),
    name: cookie.name || "",
    value: cookie.value === undefined || cookie.value === null ? "" : String(cookie.value)
  };

  if (cookie.expirationDate !== undefined) {
    result.expirationDate = cookie.expirationDate;
  }
  if (cookie.storeId !== undefined) {
    result.storeId = cookie.storeId;
  }
  if (cookie.partitionKey !== undefined) {
    result.partitionKey = cookie.partitionKey;
  }

  return result;
}

function uniqueCookies(cookies) {
  const seen = new Set();
  const result = [];

  for (const cookie of cookies || []) {
    const key = cookieDedupeKey(cookie);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(cookie);
  }

  return result;
}

async function collectYoutubeCookies() {
  const collected = [];

  for (const domain of YOUTUBE_COOKIE_DOMAINS) {
    const queryDomain = stripLeadingDot(domain);
    if (!queryDomain) {
      continue;
    }

    const cookies = await chromeCookieGetAll({ domain: queryDomain });
    collected.push.apply(collected, cookies);
  }

  const filtered = uniqueCookies(collected)
    .filter(function (cookie) {
      return isAllowedCookieDomain(cookie.domain);
    })
    .map(pickCookieFields);

  return {
    cookies: filtered,
    summary: {
      count: filtered.length
    }
  };
}

self.S9HYoutubeCookieExport = {
  YOUTUBE_COOKIE_DOMAINS: YOUTUBE_COOKIE_DOMAINS,
  isAllowedCookieDomain: isAllowedCookieDomain,
  collectYoutubeCookies: collectYoutubeCookies
};
