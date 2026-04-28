const googleSsoRegex = /name="SAMLResponse" value="([\s\S]+?)"/i;
const accountSelectionRegex = `tabindex="\\d" jsname="\\S\*" data-authuser="(-?\\d)" data-identifier="(\\S\*@DOMAIN)"`;
const stsTokenRegex =
  /<(AccessKeyId)>(\S+)<\/|<(SecretAccessKey)>(\S+)<\/|<(SessionToken)>(\S+)<\/|<(Expiration)>(\S+)<\//i;
const samlFetchErrorRegex = /var problems = {"main": "([\S\s]+)"};/i;
const roleParseRegex = /id="arn:aws:iam::([\S]+)"/;
const googleAccountChooserUrl = "https://accounts.google.com/AccountChooser";
const awsSamlUrl = "https://signin.aws.amazon.com/saml";
const awsStsUrl = "https://sts.amazonaws.com";
const arnPrefix = "arn:aws:iam::";
const googleSsoUrl =
  "https://accounts.google.com/o/saml2/initsso?idpid=IDPID&spid=SPID&forceauthn=false&authuser=";
const requestHeaders = {
  "Upgrade-Insecure-Requests": "1",
  "Cache-Control": "max-age=0",
  "Content-Type": "application/x-www-form-urlencoded",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9," +
    "image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9",
  "Sec-GPC": "1",
  "Sec-Fetch-Site": "cross-site",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Dest": "document",
  "Accept-Encoding": "gzip, deflate, br",
  "Accept-Language": "en-US,en;q=0.9",
};
const storage = getApi().storage.local;

function getApi() {
  if (typeof browser !== "undefined") {
    return browser;
  }
  if (typeof chrome !== "undefined") {
    return chrome;
  }
  return undefined;
}

// Cookie injection state
let activeCookieStoreId = null;
let pendingCookies = new Map(); // Map of URL -> cookie header string

// Set up webRequest listener to inject cookies
const api = getApi();
const canInjectCookies =
  api?.webRequest?.onBeforeSendHeaders &&
  typeof api.webRequest.onBeforeSendHeaders.addListener === "function";

if (canInjectCookies) {
  api.webRequest.onBeforeSendHeaders.addListener(
    function (details) {
      if (!activeCookieStoreId) {
        return { requestHeaders: details.requestHeaders };
      }

      const url = new URL(details.url);
      const cookieKey = `${url.protocol}//${url.hostname}`;
      const cookieHeader = pendingCookies.get(cookieKey);

      if (cookieHeader) {
        // Remove existing Cookie header if present
        const headers = details.requestHeaders.filter(
          (h) => h.name.toLowerCase() !== "cookie",
        );
        // Add our cookie header
        headers.push({ name: "Cookie", value: cookieHeader });
        return { requestHeaders: headers };
      }

      return { requestHeaders: details.requestHeaders };
    },
    { urls: ["*://*.google.com/*"] },
    ["blocking", "requestHeaders"],
  );
} else {
  console.warn(
    "webRequest.onBeforeSendHeaders is unavailable; container cookie injection is disabled.",
  );
}

// Helper function to get cookies from a container and prepare them for injection
async function prepareCookiesForUrl(url, cookieStoreId) {
  if (!cookieStoreId) return;

  const api = getApi();
  try {
    const cookies = await api.cookies.getAll({
      url: url,
      storeId: cookieStoreId,
    });

    if (cookies.length > 0) {
      const cookieHeader = cookies
        .map((c) => `${c.name}=${c.value}`)
        .join("; ");
      const urlObj = new URL(url);
      const cookieKey = `${urlObj.protocol}//${urlObj.hostname}`;
      pendingCookies.set(cookieKey, cookieHeader);
    }
  } catch (e) {
    console.error("Error preparing cookies:", e);
  }
}

// Helper function to fetch with container cookies using webRequest injection
async function fetchWithContainer(url, options = {}, cookieStoreId = null) {
  // If no container specified, use regular fetch
  if (!cookieStoreId) {
    return fetch(url, options);
  }

  try {
    // Prepare cookies for this URL
    await prepareCookiesForUrl(url, cookieStoreId);

    // Set active cookie store so webRequest listener knows to inject
    activeCookieStoreId = cookieStoreId;

    // Make the fetch request - cookies will be injected by webRequest listener
    const response = await fetch(url, {
      ...options,
      credentials: "omit", // Don't send default cookies
    });

    return response;
  } catch (e) {
    console.error("Error fetching with container cookies:", e);
    // Fallback to regular fetch
    return fetch(url, options);
  }
}

// Clean up cookie injection state
function cleanupCookieInjection() {
  activeCookieStoreId = null;
  pendingCookies.clear();
}

class portWithExceptions {
  constructor(port) {
    this.postMessage = (message) => {
      try {
        port.postMessage(message);
      } catch (err) {
        console.log(`Error while posting message back to menu. ${err}`);
      } finally {
        storage.set({ last_msg_detail: message });
      }
    };
    this.postError = (message) => {
      try {
        port.postMessage(`err: ${message}`);
        console.error(message);
      } catch (err) {
        console.log(`Error while posting message back to menu. ${err}`);
      } finally {
        storage.set({ last_msg: "err", last_msg_detail: message });
      }
    };
  }
}

getApi().runtime.onStartup.addListener(() => {
  storage.get(null, (props) => {
    if (props.autofill === undefined) storage.set({ autofill: 0 });
    if (props.autofill === 1) {
      awsInit(props, null, "role_refresh");
    }
    if (confCheck(props)) awsInit(props);
  });
});

getApi().alarms.onAlarm.addListener((alarm) => {
  storage.get(null, (props) => {
    awsInit(props);
  });
});

async function main() {
  getApi().runtime.onConnect.addListener((port) => {
    const portEx = new portWithExceptions(port);
    port.onMessage.addListener(async (msg) => {
      //Stop all background schedule jobs.
      if (msg === "refreshoff") {
        storage.set({ checked: 0 });
        getApi().alarms.clear("refreshToken");
        cleanupCookieInjection();
      }
      //Start background role refresh
      if (msg === "refreshon") {
        storage.get(null, (props) => {
          if (confCheck(props)) {
            getApi().alarms.create("refreshToken", {
              periodInMinutes: Number.parseInt(props.refresh_interval),
            });
            awsInit(props, portEx);
          } else {
            portEx.postError("One or more option isn't configured properly.");
          }
        });
      }
      //Start role refresh
      if (msg === "role_refresh") {
        storage.get(null, (props) => {
          if (confCheck(props)) awsInit(props, portEx, msg);
        });
      }
    });
  });
}

main();

function confCheck(props) {
  if (
    (props.organization_domain || props.google_idpid || props.google_spid) ===
    ""
  ) {
    return false;
  }
  return true;
}

function errHandler(port, msg) {
  if (port) {
    port.postError(msg);
  } else {
    console.error(msg);
    storage.set({ last_msg: "err", last_msg_detail: msg });
  }
}

function refreshAwsTokensAndStsCredentials(props, port, samlResponse) {
  const role = props[props.checked];
  const roleArn = arnPrefix + role;
  const awsAccount = roleArn.split(":")[4];
  const principalArn = `${arnPrefix}${awsAccount}:saml-provider/${props.saml_provider}`;
  const accountName = ((props.accountNames || {})[awsAccount] || '').replace(/\s*\(\d+\)\s*$/, '') || undefined;
  const data = `RelayState=&SAMLResponse=${encodeURIComponent(samlResponse)}&name=&portal=&roleIndex=${encodeURIComponent(roleArn)}`;
  fetch(awsSamlUrl, {
    method: "POST",
    body: data,
    headers: requestHeaders,
  })
    .then((response) => response.text())
    .then((response) => {
      const errorCheck = response.match(samlFetchErrorRegex);
      if (errorCheck) {
        const msg = `SAML fetch reponse returned error: ${errorCheck[1]}`;
        throw msg;
      }
      const date = new Date().toLocaleString();
      console.log(`AWS AlwaysON refreshed tokens successfuly at ${date}`);
      fetchSts(roleArn, principalArn, samlResponse, props, port, accountName);
    })
    .catch((error) => {
      const msg = `Error in SAML fetch:${error}`;
      errHandler(port, msg);
    });
}

function refreshAwsRoles(port, samlResponse) {
  const data = `RelayState=&SAMLResponse=${encodeURIComponent(samlResponse)}`;
  fetch(awsSamlUrl, {
    method: "POST",
    body: data,
    headers: requestHeaders,
  })
    .then((response) => response.text())
    .then((response) => {
      const errorCheck = response.match(samlFetchErrorRegex);
      if (errorCheck) {
        const msg = `SAML fetch reponse returned error: ${errorCheck[1]}`;
        throw msg;
      }

      const samlAccountPattern =
        /.*Account:\s*([^<]+)<\/div>[\s\S]{0,500}?id="arn:aws:iam::(\d+)/gi;
      const accountNames = Array.from(
        response.matchAll(samlAccountPattern),
      ).reduce(
        (acc, match) => ({
          ...acc,
          [match[2].trim()]: match[1].trim(),
        }),
        {},
      );

      const roles = Array.from(
        response.matchAll(new RegExp(roleParseRegex, "g")),
      );
      roles.forEach((match, i) => storage.set({ [`role${i}`]: match[1] }));

      storage.set({ roleCount: roles.length, accountNames });
      if (port) port.postMessage("roles_refreshed");
    })
    .catch((error) => {
      const msg = `Error in SAML fetch:${error}`;
      errHandler(port, msg);
    });
}

async function awsInit(props, port = null, jobType = "refresh") {
  const cookieStoreId = props.container_id || null;

  // Prepare cookies for Google domains if using a container
  if (cookieStoreId) {
    await prepareCookiesForUrl("https://accounts.google.com/", cookieStoreId);
    activeCookieStoreId = cookieStoreId;
  }

  try {
    const response = await fetchWithContainer(
      googleAccountChooserUrl,
      {},
      cookieStoreId,
    );
    const accounts = await response.text();

    if (accounts.indexOf(props.domain) === -1) {
      const msg =
        "Organization domain not found. Please check that you have a Google Account with that domain name logged in.";
      throw msg;
    }

    const samlResponse = await findAccountIndex(props, cookieStoreId);

    if (!samlResponse) {
      throw "Could not get SAML response from any authuser index";
    }

    switch (jobType) {
      case "role_refresh":
        refreshAwsRoles(port, samlResponse);
        break;
      default:
        refreshAwsTokensAndStsCredentials(props, port, samlResponse);
    }
  } catch (error) {
    const msg = `Error in AWS init: ${error}`;
    errHandler(port, msg);
  } finally {
    cleanupCookieInjection();
  }
}

function fetchSts(roleArn, principalArn, samlResponse, props, port, profileName) {
  const formBody = new URLSearchParams({
    Version: "2011-06-15",
    Action: "AssumeRoleWithSAML",
    RoleArn: roleArn,
    PrincipalArn: principalArn,
    SAMLAssertion: samlResponse.trim(),
    DurationSeconds: props.session_duration,
  }).toString();

  fetch(awsStsUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "*/*",
    },
    body: formBody,
  })
    .then((response) => response.text())
    .then((data) => {
      const parseGlobal = RegExp(stsTokenRegex, "g");
      let matches;
      const credobj = {};
      while ((matches = parseGlobal.exec(data)) !== null) {
        matches = matches.filter((i) => i != null);
        storage.set({ [`aws${matches[1]}`]: matches[2] });
        credobj[`${matches[1]}`] = matches[2];
      }
      if (profileName) credobj['ProfileName'] = profileName;
      if (props.clientupdate) {
        fetch("http://localhost:31339/update", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify(credobj),
        })
          .then((response) => response.text())
          .then((data) => {
            if (data !== "ok") {
              errHandler(port, data);
            }
          })
          .catch((error) => {
            const msg = `Error updating local client:${error}`;
            errHandler(port, msg);
          });
      }

      storage.set({ last_msg: "success" });
      if (port) port.postMessage("sts_ready");
    })
    .catch((error) => {
      const msg = `Error getting STS credentials:${error}`;
      errHandler(port, msg);
    });
}

async function findAccountIndex(props, cookieStoreId = null) {
  const url = `${googleSsoUrl.replace("IDPID", props.google_idpid).replace("SPID", props.google_spid)}`;

  for (let i = 0; i <= 10; i++) {
    console.debug(`Attempting authuser=${i}`);

    // Prepare cookies before each request
    if (cookieStoreId) {
      await prepareCookiesForUrl(`${url}${i}`, cookieStoreId);
    }

    const response = await fetchWithContainer(`${url}${i}`, {}, cookieStoreId);
    const text = await response.text();

    try {
      const samlResponse = text.match(googleSsoRegex)[1];
      console.log(`Success with authuser=${i}`);
      return samlResponse;
    } catch (error) {
      // Continue to next authuser
    }
  }

  return null;
}
