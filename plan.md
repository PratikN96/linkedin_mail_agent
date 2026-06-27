# LinkedIn Mail Agent — Plan

## What it does
A Telegram bot that:
1. Accepts a LinkedIn post screenshot OR plain text containing an email
2. Extracts the email address (Vision AI for images, regex for text)
3. Verifies an email was actually found — warns user if not
4. Drafts a job application email using a fixed template
5. Replies to Telegram with the draft for review
6. *(Phase 2)* Sends the email directly with resume attached

---

## Stack

| Layer | Tool | Why |
|---|---|---|
| Bot interface | Telegram Bot API | Always-on via webhook, no polling needed |
| Hosting | Supabase Edge Functions (Deno) | Serverless, free tier, webhook-ready |
| Image OCR | Gemini 1.5 Flash API (free tier) | Best accuracy for screenshots, 1500 req/day free |
| Text extraction | Regex | No LLM needed for plain text |
| Email sending | Gmail SMTP (Phase 2) | Simple, no extra infra |

---

## Architecture

```
User (Telegram)
    │
    │  sends photo / text
    ▼
Supabase Edge Function  (POST /telegram-webhook)
    │
    ├── photo?  →  download from Telegram CDN
    │               →  Gemini Vision API  →  extract email
    │
    └── text?   →  regex match  →  extract email
    │
    ├── no email found?  →  reply "❌ No email found, please check and retry"
    │
    └── email found?
            →  compose draft (fixed template + env vars)
            →  reply with draft preview in Telegram
            →  (Phase 2) inline "Send" button → Gmail SMTP
```

---

## File Structure

```
linkedin_mail_agent/
├── plan.md                              ← this file
├── .env.example                         ← env var template
├── .gitignore
└── supabase/
    └── functions/
        └── telegram-webhook/
            └── index.ts                 ← main edge function
```

---

## Environment Variables

| Variable | Description |
|---|---|
| `TELEGRAM_TOKEN` | Bot token from @BotFather |
| `GEMINI_API_KEY` | Google AI Studio API key (free) |
| `YOUR_NAME` | Your full name (used in email signature) |
| `YOUR_ROLE` | Your role/background e.g. "ML Engineer with 3 years experience" |
| `YOUR_EMAIL` | Your email address |
| `YOUR_PHONE` | Your phone number |
| `YOUR_LINKEDIN` | Your LinkedIn profile URL |

---

## Setup Steps

1. Create Telegram bot via @BotFather → get `TELEGRAM_TOKEN`
2. Get Gemini API key from [Google AI Studio](https://aistudio.google.com) → get `GEMINI_API_KEY`
3. Deploy Supabase Edge Function → get function URL
4. Register webhook: `GET https://api.telegram.org/bot<TOKEN>/setWebhook?url=<FUNCTION_URL>`
5. Fill `.env` with your details
6. Set env vars in Supabase dashboard

---

## Phase 2 (Sending Email)

- Add inline keyboard button "Send ✉️" to the draft reply
- Store draft in Supabase DB keyed to chat_id
- On button press → send via Gmail SMTP with resume PDF attached
- Reply "✅ Sent to [email]"
