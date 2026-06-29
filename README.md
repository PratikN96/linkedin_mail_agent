# LinkedIn Mail Agent

A Telegram bot that automates job application emails. Send it a LinkedIn post screenshot (or paste an email address) and it instantly creates a Gmail draft with your resume attached — ready to send in one click.

## What It Does

1. You send a LinkedIn recruiter post screenshot to the Telegram bot
2. It extracts the email address using vision AI
3. It creates a Gmail draft with your job application email + resume PDF attached
4. It sends you a preview in Telegram

If you've already emailed that address within the last 15 days, it skips the draft and tells you — avoiding accidental duplicates while still allowing re-contact for new job postings.

## Features

- **Screenshot → Email extraction** via OpenRouter Vision (Qwen 3.6-35B)
- **Plain text fallback** — just paste the email directly if no screenshot
- **Auto Gmail draft** with resume PDF attachment (via Gmail REST API)
- **Duplicate guard** — skips if contacted within 15 days, warns if contacted recently
- **Instant Telegram preview** showing recipient, subject, and email body

## Tech Stack

- **Runtime**: Supabase Edge Function (Deno)
- **Bot**: Telegram Bot API
- **Vision AI**: OpenRouter (Qwen 3.6-35B)
- **Email**: Gmail API (OAuth2)
- **Resume storage**: Supabase Storage

## How to Deploy Your Own

### 1. Prerequisites
- [Supabase](https://supabase.com) project
- Telegram bot token from [@BotFather](https://t.me/BotFather)
- [OpenRouter](https://openrouter.ai) API key
- Google Cloud project with Gmail API enabled

### 2. Set Supabase Secrets

```bash
supabase secrets set TELEGRAM_TOKEN=...
supabase secrets set OPENROUTER_API_KEY=...
supabase secrets set YOUR_NAME="Your Name"
supabase secrets set YOUR_EMAIL="you@gmail.com"
supabase secrets set GMAIL_CLIENT_ID=...
supabase secrets set GMAIL_CLIENT_SECRET=...
supabase secrets set GMAIL_REFRESH_TOKEN=...
```

To get a Gmail refresh token, run:
```bash
pip install google-auth-oauthlib
python get_gmail_token.py
```

### 3. Upload Your Resume

Upload your resume PDF to a Supabase Storage public bucket called `resumes`, then update `RESUME_FILENAME` and `RESUME_URL` in `index.ts`.

### 4. Deploy

```bash
supabase functions deploy telegram-webhook
```

### 5. Register the Webhook

```
https://api.telegram.org/bot<TELEGRAM_TOKEN>/setWebhook?url=<FUNCTION_URL>
```

## Project Structure

```
supabase/functions/telegram-webhook/index.ts   # entire bot logic
get_gmail_token.py                             # one-time OAuth setup script
```
