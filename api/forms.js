const NOTIFICATION_EMAIL = process.env.NOTIFICATION_EMAIL || "daniel.e.munro@gmail.com";
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX = {
  newsletter: 6,
  sponsor: 4,
};
const MIN_SUBMIT_AGE_MS = 800;
const GENERIC_FAILURE_MESSAGE =
  "We could not send your request right now. Please try again shortly.";

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeText(value) {
  return String(value || "").trim();
}

function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length) {
    return forwarded.split(",")[0].trim();
  }
  return req.socket && req.socket.remoteAddress ? req.socket.remoteAddress : "unknown";
}

function getRateLimitStore() {
  if (!globalThis.__dgcFormRateLimit) {
    globalThis.__dgcFormRateLimit = new Map();
  }
  return globalThis.__dgcFormRateLimit;
}

function checkRateLimit(ip, formType) {
  const store = getRateLimitStore();
  const key = `${ip}:${formType}`;
  const now = Date.now();
  const recent = (store.get(key) || []).filter(
    (timestamp) => now - timestamp < RATE_LIMIT_WINDOW_MS
  );
  const limit = RATE_LIMIT_MAX[formType] || 4;

  if (recent.length >= limit) {
    store.set(key, recent);
    return false;
  }

  recent.push(now);
  store.set(key, recent);
  return true;
}

function isSpamTrapTriggered(payload) {
  if (normalizeText(payload.company)) return true;
  const startedAt = Number(payload.startedAt);
  if (Number.isFinite(startedAt) && startedAt > 0) {
    return Date.now() - startedAt < MIN_SUBMIT_AGE_MS;
  }
  return false;
}

function validateEmail(value) {
  const email = normalizeText(value).toLowerCase();
  if (!email) throw new Error("Email is required.");
  if (email.length > 254) throw new Error("Email is too long.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Enter a valid email address.");
  return email;
}

function validateUrl(value) {
  const input = normalizeText(value);
  if (!input) throw new Error("Website is required.");
  let url;
  try {
    url = new URL(input);
  } catch (error) {
    throw new Error("Enter a valid website URL.");
  }
  if (!["http:", "https:"].includes(url.protocol))
    throw new Error("Website must start with http:// or https://.");
  return url.toString();
}

function validatePhone(value) {
  const phone = normalizeText(value);
  const digits = phone.replace(/[^\d+]/g, "");
  if (!phone) throw new Error("Phone is required.");
  if (digits.length < 7 || digits.length > 20) throw new Error("Enter a valid phone number.");
  return phone;
}

function validateMessage(value) {
  const message = normalizeText(value);
  if (!message) throw new Error("Tell us what you would like to promote.");
  if (message.length < 10)
    throw new Error("Add a little more detail about what you want to promote.");
  if (message.length > 2000) throw new Error("Promotion details are too long.");
  return message;
}

function buildEmailContent(type, payload, req) {
  const ip = getClientIp(req);
  const referer = req.headers.referer || "unknown";
  const userAgent = req.headers["user-agent"] || "unknown";
  const submittedAt = new Date().toISOString();

  if (type === "newsletter") {
    const subject = "New DGC newsletter signup";
    const text = [
      "New newsletter signup",
      "",
      `Email: ${payload.email}`,
      `Submitted: ${submittedAt}`,
      `Source: ${referer}`,
      `IP: ${ip}`,
      `User-Agent: ${userAgent}`,
    ].join("\n");

    const html = `
      <h1>New newsletter signup</h1>
      <p><strong>Email:</strong> ${escapeHtml(payload.email)}</p>
      <p><strong>Submitted:</strong> ${escapeHtml(submittedAt)}</p>
      <p><strong>Source:</strong> ${escapeHtml(referer)}</p>
      <p><strong>IP:</strong> ${escapeHtml(ip)}</p>
      <p><strong>User-Agent:</strong> ${escapeHtml(userAgent)}</p>
    `;

    return {
      subject,
      text,
      html,
      replyTo: payload.email,
    };
  }

  const subject = "New DGC sponsor application";
  const text = [
    "New sponsor application",
    "",
    `Email: ${payload.email}`,
    `Phone: ${payload.phone}`,
    `Website: ${payload.website}`,
    `Promote: ${payload.promote}`,
    `Submitted: ${submittedAt}`,
    `Source: ${referer}`,
    `IP: ${ip}`,
    `User-Agent: ${userAgent}`,
  ].join("\n");

  const html = `
    <h1>New sponsor application</h1>
    <p><strong>Email:</strong> ${escapeHtml(payload.email)}</p>
    <p><strong>Phone:</strong> ${escapeHtml(payload.phone)}</p>
    <p><strong>Website:</strong> ${escapeHtml(payload.website)}</p>
    <p><strong>Promote:</strong><br>${escapeHtml(payload.promote).replace(/\n/g, "<br>")}</p>
    <p><strong>Submitted:</strong> ${escapeHtml(submittedAt)}</p>
    <p><strong>Source:</strong> ${escapeHtml(referer)}</p>
    <p><strong>IP:</strong> ${escapeHtml(ip)}</p>
    <p><strong>User-Agent:</strong> ${escapeHtml(userAgent)}</p>
  `;

  return {
    subject,
    text,
    html,
    replyTo: payload.email,
  };
}

async function sendEmail(message) {
  if (!process.env.RESEND_API_KEY) {
    throw new Error("Mail service is not configured. Set RESEND_API_KEY before deploying.");
  }
  if (!process.env.MAIL_FROM) {
    throw new Error("Mail service is not configured. Set MAIL_FROM before deploying.");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.MAIL_FROM,
      to: [NOTIFICATION_EMAIL],
      reply_to: message.replyTo,
      subject: message.subject,
      text: message.text,
      html: message.html,
    }),
  });

  if (!response.ok) {
    const error = await response.text().catch(() => "");
    console.error("Mail delivery failed", error || response.statusText);
    throw new Error(GENERIC_FAILURE_MESSAGE);
  }
}

function validatePayload(formType, payload) {
  if (formType === "newsletter") {
    return {
      email: validateEmail(payload.email),
    };
  }

  if (formType === "sponsor") {
    return {
      email: validateEmail(payload.email),
      phone: validatePhone(payload.phone),
      website: validateUrl(payload.website),
      promote: validateMessage(payload.promote),
    };
  }

  throw new Error("Unknown form type.");
}

function isJsonRequest(req) {
  const accept = String(req.headers.accept || "");
  const contentType = String(req.headers["content-type"] || "");
  const requestedWith = String(req.headers["x-requested-with"] || "");
  return (
    accept.includes("application/json") ||
    contentType.includes("application/json") ||
    requestedWith.toLowerCase() === "xmlhttprequest"
  );
}

function isUserInputError(message) {
  return /required|valid|Unknown form type|Too many|Mail service is not configured/i.test(message);
}

function getReturnHref(req) {
  const referer = normalizeText(req.headers.referer);
  if (referer.startsWith("/") || /^https?:\/\//i.test(referer)) {
    return referer;
  }
  return "/";
}

function renderHtmlPage(title, message, req) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
</head>
<body>
  <main>
    <h1>${escapeHtml(title)}</h1>
    <p>${escapeHtml(message)}</p>
    <p><a href="${escapeHtml(getReturnHref(req))}">Return to the festival site</a></p>
  </main>
</body>
</html>`;
}

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

function sendHtml(res, status, title, message, req) {
  res.statusCode = status;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(renderHtmlPage(title, message, req));
}

function parseUrlEncoded(raw) {
  const params = new URLSearchParams(raw);
  return Object.fromEntries(params.entries());
}

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    req.on("end", () => {
      resolve(Buffer.concat(chunks).toString("utf8"));
    });
    req.on("error", reject);
  });
}

async function parseRequestBody(req) {
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) {
    return req.body;
  }

  const raw =
    typeof req.body === "string"
      ? req.body
      : Buffer.isBuffer(req.body)
        ? req.body.toString("utf8")
        : await readRawBody(req);

  if (!raw) return {};

  const contentType = String(req.headers["content-type"] || "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  if (contentType === "application/x-www-form-urlencoded") {
    return parseUrlEncoded(raw);
  }
  if (contentType === "application/json" || raw.trim().startsWith("{")) {
    return JSON.parse(raw);
  }
  return parseUrlEncoded(raw);
}

module.exports = async function handler(req, res) {
  const respondWithJson = isJsonRequest(req);

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    if (respondWithJson) return sendJson(res, 405, { error: "Method not allowed." });
    return sendHtml(
      res,
      405,
      "Method Not Allowed",
      "This endpoint only accepts form submissions.",
      req
    );
  }

  try {
    const payload = await parseRequestBody(req);
    const formType = normalizeText(payload.formType);

    if (!formType) {
      if (respondWithJson) return sendJson(res, 400, { error: "Missing form type." });
      return sendHtml(res, 400, "Submission Error", "Missing form type.", req);
    }

    if (isSpamTrapTriggered(payload)) {
      if (respondWithJson) return sendJson(res, 200, { ok: true });
      return sendHtml(res, 200, "Thanks", "Your request has been received.", req);
    }

    const ip = getClientIp(req);
    if (!checkRateLimit(ip, formType)) {
      const message = "Too many submissions. Please wait a few minutes and try again.";
      if (respondWithJson) return sendJson(res, 429, { error: message });
      return sendHtml(res, 429, "Please Wait", message, req);
    }

    const validated = validatePayload(formType, payload);
    const message = buildEmailContent(formType, validated, req);
    await sendEmail(message);

    if (respondWithJson) return sendJson(res, 200, { ok: true });

    const successMessage =
      formType === "newsletter"
        ? "Thanks. You are on the list."
        : "Thanks. Your sponsor application has been received.";
    return sendHtml(res, 200, "Thanks", successMessage, req);
  } catch (error) {
    console.error("Form submission failed", error);
    const rawMessage = error && error.message ? error.message : GENERIC_FAILURE_MESSAGE;
    const isInputError = isUserInputError(rawMessage);
    const status = isInputError ? 400 : 500;
    const safeMessage = isInputError ? rawMessage : GENERIC_FAILURE_MESSAGE;

    if (respondWithJson) return sendJson(res, status, { error: safeMessage });

    const title = status === 400 ? "Submission Error" : "Temporary Error";
    return sendHtml(res, status, title, safeMessage, req);
  }
};
