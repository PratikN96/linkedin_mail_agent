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

  const body = `Hi,

I came across your LinkedIn post and wanted to reach out directly.

I'm a Product Manager with 4 years of experience, with a background from IIT and IIM. Across my career I've led 0-to-1 product builds, driven cross-functional roadmaps, and worked closely with engineering and design to ship user-centric products.

I'd love to explore if there's a PM opportunity on your team that could be a good fit. I've attached my resume for your reference - happy to connect for a quick call at your convenience.

Looking forward to hearing from you.


Regards,
${YOUR_NAME}
${YOUR_EMAIL}
https://github.com/PratikN96`;

  const telegramPreview =
    `✅ *Draft created in Gmail!*\n\n` +
    `*To:* \`${recipientEmail}\`\n` +
    `*Subject:* ${subject}\n` +
    `*Attachment:* ${RESUME_FILENAME}\n\n` +
    `*Body:*\n\`\`\`\n${body}\n\`\`\``;

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
  body: string,
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
    `Content-Type: text/plain; charset="UTF-8"`,
    `Content-Transfer-Encoding: 7bit`,
    ``,
    body,
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

async function createGmailDraft(
  to: string,
  subject: string,
  body: string,
): Promise<void> {
  const [accessToken, pdfRes] = await Promise.all([
    getGmailAccessToken(),
    fetch(RESUME_URL),
  ]);

  const pdfBuffer = await pdfRes.arrayBuffer();
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
}

// ── OpenRouter Vision — extract email from image ──────────────────────────────

async function extractEmailFromImage(
  base64Data: string,
  mimeType: string,
): Promise<string | null> {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
    },
    body: JSON.stringify({
      model: "meta-llama/llama-3.2-11b-vision-instruct:free",
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
              image_url: { url: `data:${mimeType};base64,${base64Data}` },
            },
          ],
        },
      ],
      temperature: 0,
    }),
  });

  const data = await res.json();
  const raw: string =
    data.choices?.[0]?.message?.content?.trim() ?? "";

  if (!raw || raw === "NO_EMAIL") return null;

  const match = raw.match(EMAIL_REGEX);
  return match?.[0] ?? null;
}

// ── Telegram helpers ───────────────────────────────────────────────────────────

async function getImageBase64(
  fileId: string,
): Promise<{ base64: string; mimeType: string } | null> {
  const fileRes = await fetch(`${TELEGRAM_API}/getFile?file_id=${fileId}`);
  const fileData = await fileRes.json();
  const filePath: string | undefined = fileData.result?.file_path;
  if (!filePath) return null;

  const imageRes = await fetch(
    `https://api.telegram.org/file/bot${TELEGRAM_TOKEN}/${filePath}`,
  );
  const buffer = await imageRes.arrayBuffer();
  const base64 = btoa(
    String.fromCharCode(...new Uint8Array(buffer)),
  );

  const mimeType = filePath.toLowerCase().endsWith(".png")
    ? "image/png"
    : "image/jpeg";

  return { base64, mimeType };
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
      // Photo — use Gemini Vision
      await sendMessage(chatId, "🔍 Scanning screenshot for email address...");

      const photos = message.photo as Array<{ file_id: string }>;
      const largest = photos[photos.length - 1]; // highest resolution
      const image = await getImageBase64(largest.file_id);

      if (image) {
        email = await extractEmailFromImage(image.base64, image.mimeType);
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
      await createGmailDraft(email, subject, body);
      await sendMessage(chatId, telegramPreview);
    }
  } catch (err) {
    console.error("Webhook error:", err);
  }

  return new Response("ok", { status: 200 });
});
