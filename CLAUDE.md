# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

A Telegram bot that extracts email addresses from LinkedIn post screenshots (via vision AI) or plain text (via regex), then creates a Gmail draft with a fixed job application email template and resume PDF attachment.

## Deployment

This is a **Supabase Edge Function** running on the Deno runtime — there is no local build step and no npm/package.json.

```bash
# Deploy to Supabase
supabase functions deploy telegram-webhook

# Serve locally for testing
supabase functions serve telegram-webhook
```

After deploy, register the Telegram webhook once:
```
GET https://api.telegram.org/bot<TELEGRAM_TOKEN>/setWebhook?url=<FUNCTION_URL>
```

There is no test suite.

## Architecture

Single file: `supabase/functions/telegram-webhook/index.ts`

**Request flow:**
1. Telegram sends a POST webhook to the Edge Function
2. If `message.photo` → download from Telegram CDN → OpenRouter Vision (Qwen 3.6-35B) → extract email with 30s timeout
3. If `message.text` → regex match for email
4. If email found → fetch resume PDF from Supabase Storage + get Gmail access token (in parallel) → build MIME multipart → POST to Gmail Drafts API → send preview back to Telegram
5. If email not found → reply with error

## Environment Variables

Set these in the Supabase dashboard (not in `.env` — the Edge Function reads from `Deno.env`):

| Variable | Source |
|---|---|
| `TELEGRAM_TOKEN` | @BotFather |
| `OPENROUTER_API_KEY` | openrouter.ai |
| `YOUR_NAME` | Your name for email signature |
| `YOUR_EMAIL` | Your Gmail address |
| `GMAIL_CLIENT_ID` | Google Cloud Console |
| `GMAIL_CLIENT_SECRET` | Google Cloud Console |
| `GMAIL_REFRESH_TOKEN` | Run `python get_gmail_token.py` |
| `SUPABASE_URL` | Auto-injected by Supabase Edge Functions runtime |
| `SUPABASE_SERVICE_ROLE_KEY` | Auto-injected by Supabase Edge Functions runtime |

## Gmail OAuth Setup

The `get_gmail_token.py` script is a one-time utility to obtain a `GMAIL_REFRESH_TOKEN`. It requires `pip install google-auth-oauthlib` and outputs `supabase secrets set` commands.

## Key Implementation Details

- **Resume**: Hardcoded as `pratik_IIT_IIM_productManager_4yoe.pdf`, fetched from Supabase Storage public URL at `RESUME_URL`. To change the resume, update both `RESUME_FILENAME` and `RESUME_URL` constants in `index.ts`.
- **Email template**: Fixed PM template in `composeDraft()` — subject line uses `YOUR_NAME`; the body and signature are fully hardcoded strings (phone/email in the body are literal, not from env vars).
- **Vision model**: OpenRouter `qwen/qwen3.6-35b-a3b` with `temperature: 0`, 30s AbortController timeout. Falls back to asking user to paste text if it times out.
- **Email sending**: Despite the function being named `createGmailDraft`, it actually **sends** the email directly via `gmail/v1/users/me/messages/send`. Built as RFC 2822 multipart/mixed MIME, base64url-encoded. Access token is refreshed on every request via OAuth2 refresh token flow. API response is not checked — errors are silently swallowed.
- **Duplicate guard**: Before sending, checks the `contacted_emails` Supabase table. Skips if the same address was emailed within the last 15 days; records every send via `recordDraft()`. Uses `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` env vars (auto-injected by Supabase Edge Functions runtime).
- **Supabase project ID**: `krlchtcdnsvjvupbefza`

## Phase 2 (Not Yet Implemented)

- Inline "Send" button in Telegram response
- Store draft in Supabase DB keyed to `chat_id`
- On button press → send the email (not just draft)
