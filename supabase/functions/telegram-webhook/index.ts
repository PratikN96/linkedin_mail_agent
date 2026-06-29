import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const TELEGRAM_TOKEN = Deno.env.get("TELEGRAM_TOKEN")!;
const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY")!;
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;

const YOUR_NAME = Deno.env.get("YOUR_NAME") ?? "Pratik Nandeshwar";
const YOUR_EMAIL = Deno.env.get("YOUR_EMAIL") ?? "your@email.com";
const RESUME_FILENAME = "pratik_IIT_IIM_productManager_4yoe.pdf";
const RESUME_URL = `https://krlchtcdnsvjvupbefza.supabase.co/storage/v1/object/public/resumes/${RESUME_FILENAME}`;

const GMAIL_CLIENT_ID = Deno.env.get("GMAIL_CLIENT_ID")!;
const GMAIL_CLIENT_SECRET = Deno.env.get("GMAIL_CLIENT_SECRET")!;
const GMAIL_REFRESH_TOKEN = Deno.env.get("GMAIL_REFRESH_TOKEN")!;

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

// ── Email draft ────────────────────────────────────────────────────────────────

function composeDraft(recipientEmail: string): { subject: string; body: string; telegramPreview: string } {
  const subject = `Product Manager Job Application | ${YOUR_NAME} (IIT | IIM, 4 YOE)`;

  const body = `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#222;">
<p>Hi,</p>
<p>I'm a Product Manager with 4+ years of experience, currently working at Hoora. Previously, I founded and built my own fashion e-commerce startup, leading it from 0&rarr;1. I hold an MBA from IIM Rohtak and a B.Tech from IIT Roorkee.</p>
<p>I've attached my resume for your consideration. I'd appreciate the opportunity to discuss how I can contribute to your team.</p>
<p>Best regards,<br>
Pratik Nandeshwar<br>
+91 9720354711<br>
pratiknandeshwar7@gmail.com</p>
</div>`;

  const plainPreview = `Hi,\n\nI'm a Product Manager with 4+ years of experience, currently working at Hoora. Previously, I founded and built my own fashion e-commerce startup, leading it from 0→1. I hold an MBA from IIM Rohtak and a B.Tech from IIT Roorkee.\n\nI've attached my resume for your consideration. I'd appreciate the opportunity to discuss how I can contribute to your team.\n\nBest regards,\nPratik Nandeshwar\n+91 9720354711\npratiknandeshwar7@gmail.com`;

  const telegramPreview =
    `✅ *Draft created in Gmail!*\n\n` +
    `*To:* \`${recipientEmail}\`\n` +
    `*Subject:* ${subject}\n` +
    `*Attachment:* ${RESUME_FILENAME}\n\n` +
    `*Body:*\n\`\`\`\n${plainPreview}\n\`\`\``;

  return { subject, body, telegramPreview };
}

// ── Gmail — get access token + create draft ────────────────────────────────────

async function getGmailAccessToken(): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GMAIL_CLIENT_ID,
      client_secret: GMAIL_CLIENT_SECRET,
      refresh_token: GMAIL_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });
  const data = await res.json();
  return data.access_token;
}

function toBase64Url(str: string): string {
  return btoa(unescape(encodeURIComponent(str)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function buildRawEmailWithAttachment(
  to: string,
  subject: string,
  bodyHtml: string,
  pdfBase64: string,
): string {
  const boundary = "----=_Part_boundary_linkedin_mail_agent";

  const mime = [
    `From: ${YOUR_NAME} <${YOUR_EMAIL}>`,
    `To: ${to}`,
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    ``,
    `--${boundary}`,
    `Content-Type: text/html; charset="UTF-8"`,
    `Content-Transfer-Encoding: quoted-printable`,
    ``,
    bodyHtml,
    ``,
    `--${boundary}`,
    `Content-Type: application/pdf; name="${RESUME_FILENAME}"`,
    `Content-Disposition: attachment; filename="${RESUME_FILENAME}"`,
    `Content-Transfer-Encoding: base64`,
    ``,
    pdfBase64,
    ``,
    `--${boundary}--`,
  ].join("\r\n");

  return toBase64Url(mime);
}

async function getLastSentDate(accessToken: string, toEmail: string): Promise<Date | null> {
  const query = encodeURIComponent(`to:${toEmail} in:sent`);
  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${query}&maxResults=1`,
    { headers: { "Authorization": `Bearer ${accessToken}` } },
  );
  const data = await res.json();
  const messageId: string | undefined = data.messages?.[0]?.id;
  if (!messageId) return null;

  const msgRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=metadata&metadataHeaders=Date`,
    { headers: { "Authorization": `Bearer ${accessToken}` } },
  );
  const msg = await msgRes.json();
  const dateHeader: string | undefined = msg.payload?.headers?.find(
    (h: { name: string; value: string }) => h.name === "Date",
  )?.value;
  return dateHeader ? new Date(dateHeader) : null;
}

// Returns skipped=true if emailed within 15 days (duplicate guard), else creates draft.
// daysSince is included in both cases so the caller can show context.
async function createGmailDraft(
  to: string,
  subject: string,
  body: string,
): Promise<{ skipped: boolean; daysSince: number | null }> {
  const [accessToken, pdfRes] = await Promise.all([
    getGmailAccessToken(),
    fetch(RESUME_URL),
  ]);

  const [pdfBuffer, lastSentDate] = await Promise.all([
    pdfRes.arrayBuffer(),
    getLastSentDate(accessToken, to),
  ]);

  const daysSince = lastSentDate
    ? Math.floor((Date.now() - lastSentDate.getTime()) / 86_400_000)
    : null;

  // Skip if emailed within the last 15 days (likely accidental duplicate)
  if (daysSince !== null && daysSince < 15) {
    return { skipped: true, daysSince };
  }

  const pdfBase64 = arrayBufferToBase64(pdfBuffer);
  const raw = buildRawEmailWithAttachment(to, subject, body, pdfBase64);

  await fetch("https://gmail.googleapis.com/gmail/v1/users/me/drafts", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ message: { raw } }),
  });

  return { skipped: false, daysSince };
}

// ── OpenRouter Vision — extract email from image ──────────────────────────────

async function extractEmailFromImage(imageUrl: string): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
      },
      body: JSON.stringify({
        model: "qwen/qwen3.6-35b-a3b",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Extract the email address from this image. Return ONLY the email address, no other text. If no email address is present, return exactly: NO_EMAIL",
              },
              {
                type: "image_url",
                image_url: { url: imageUrl },
              },
            ],
          },
        ],
        temperature: 0,
      }),
    });

    const data = await res.json();
    const raw: string = data.choices?.[0]?.message?.content?.trim() ?? "";

    if (!raw || raw === "NO_EMAIL") return null;

    const match = raw.match(EMAIL_REGEX);
    return match?.[0] ?? null;
  } finally {
    clearTimeout(timeout);
  }
}

// ── Telegram helpers ───────────────────────────────────────────────────────────

async function getTelegramFileUrl(fileId: string): Promise<string | null> {
  const fileRes = await fetch(`${TELEGRAM_API}/getFile?file_id=${fileId}`);
  const fileData = await fileRes.json();
  const filePath: string | undefined = fileData.result?.file_path;
  if (!filePath) return null;
  return `https://api.telegram.org/file/bot${TELEGRAM_TOKEN}/${filePath}`;
}

async function sendMessage(chatId: number, text: string): Promise<void> {
  await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "Markdown",
    }),
  });
}

// ── Main handler ───────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("ok", { status: 200 });
  }

  try {
    const update = await req.json();
    const message = update.message;
    if (!message) return new Response("ok", { status: 200 });

    const chatId: number = message.chat.id;
    let email: string | null = null;

    if (message.photo) {
      await sendMessage(chatId, "🔍 Scanning screenshot for email address...");

      const photos = message.photo as Array<{ file_id: string }>;
      const largest = photos[photos.length - 1];
      const imageUrl = await getTelegramFileUrl(largest.file_id);

      if (imageUrl) {
        try {
          email = await extractEmailFromImage(imageUrl);
        } catch {
          await sendMessage(chatId, "⚠️ Vision model timed out. Please paste the email as text instead.");
          return new Response("ok", { status: 200 });
        }
      }
    } else if (message.text) {
      // Plain text — regex only, no LLM needed
      const matches: string[] | null = message.text.match(EMAIL_REGEX);
      email = matches?.[0] ?? null;
    } else {
      await sendMessage(
        chatId,
        "⚠️ Please send a screenshot or a text message containing an email address.",
      );
      return new Response("ok", { status: 200 });
    }

    if (!email) {
      await sendMessage(
        chatId,
        "❌ No email address found. Please check and try again.",
      );
    } else {
      const { subject, body, telegramPreview } = composeDraft(email);
      const { skipped, daysSince } = await createGmailDraft(email, subject, body);

      if (skipped) {
        await sendMessage(
          chatId,
          `⏭️ Skipped — already emailed \`${email}\` *${daysSince} day${daysSince === 1 ? "" : "s"} ago*. Draft not created.`,
        );
      } else {
        const historyNote = daysSince !== null
          ? `\n\n⚠️ _Note: Previously contacted ${daysSince} days ago._`
          : "";
        await sendMessage(chatId, telegramPreview + historyNote);
      }
    }
  } catch (err) {
    console.error("Webhook error:", err);
  }

  return new Response("ok", { status: 200 });
});
