"""
Run this once to get your Gmail OAuth refresh token.
Usage:
    pip install google-auth-oauthlib
    python get_gmail_token.py
"""

from google_auth_oauthlib.flow import InstalledAppFlow

CLIENT_ID = input("Paste your client_id: ").strip()
CLIENT_SECRET = input("Paste your client_secret: ").strip()

client_config = {
    "installed": {
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET,
        "auth_uri": "https://accounts.google.com/o/oauth2/auth",
        "token_uri": "https://oauth2.googleapis.com/token",
        "redirect_uris": ["urn:ietf:wg:oauth:2.0:oob", "http://localhost"],
    }
}

flow = InstalledAppFlow.from_client_config(
    client_config,
    scopes=["https://www.googleapis.com/auth/gmail.compose"],
)

creds = flow.run_local_server(port=0)

print("\n✅ Done! Run these commands:\n")
print(f'supabase secrets set GMAIL_CLIENT_ID="{CLIENT_ID}"')
print(f'supabase secrets set GMAIL_CLIENT_SECRET="{CLIENT_SECRET}"')
print(f'supabase secrets set GMAIL_REFRESH_TOKEN="{creds.refresh_token}"')
