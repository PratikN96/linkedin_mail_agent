import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const TELEGRAM_TOKEN = Deno.env.get("TELEGRAM_TOKEN")!;
const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY")!;
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;

const YOUR_NAME = Deno.env.get("YOUR_NAME") ?? "Your Name";
const YOUR_ROLE = Deno.env.get("YOUR_ROLE") ?? "Software Engineer";
const YOUR_EMAIL = Deno.env.get("YOUR_EMAIL") ?? "your@email.com";
const YOUR_PHONE = Deno.env.get("YOUR_PHONE") ?? "";
const YOUR_LINKEDIN = Deno.env.get("YOUR_LINKEDIN") ?? "";

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

// ── Email draft ────────────────────────────────────────────────────────────────

function composeDraft(recipientEmail: string): string {
  const subject = `Exploring Opportunities — ${YOUR_NAME}`;

  const body = `Hi,

I came across your post on LinkedIn and wanted to reach out.

I am a ${YOUR_ROLE} and am actively exploring new opportunities. I'd love to connect and learn if there are any open roles on your team that might be a good fit.

I've attached my resume for your reference. Happy to jump on a quick call at your convenience.

Looking forward to hearing from you!

Best regards,
${YOUR_NAME}
${YOUR_EMAIL}${YOUR_PHONE ? `\n${YOUR_PHONE}` : ""}${YOUR_LINKEDIN ? `\n${YOUR_LINKEDIN}` : ""}`;

  return (
    `📧 *Email Draft*\n\n` +
    `*To:* \`${recipientEmail}\`\n` +
    `*Subject:* ${subject}\n\n` +
    `*Body:*\n\`\`\`\n${body}\n\`\`\``
  );
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
      const draft = composeDraft(email);
      await sendMessage(chatId, draft);
    }
  } catch (err) {
    console.error("Webhook error:", err);
  }

  return new Response("ok", { status: 200 });
});
