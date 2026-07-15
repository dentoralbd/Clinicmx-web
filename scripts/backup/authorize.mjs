// One-time setup: grants the backup script access to your Google Drive and
// captures a long-lived refresh token. Run this once locally after creating an
// OAuth Client ID (Desktop app type) — see README.md for the Google Cloud steps.
//
//   node authorize.mjs
//
// It starts a temporary local server, prints a URL for you to open in your own
// browser, and once you approve access, saves GOOGLE_OAUTH_REFRESH_TOKEN into
// .env.backup automatically.
import http from 'node:http';
import { OAUTH_SCOPES, loadEnv, requireEnv, getOAuth2Client, saveEnvLocal } from './lib.mjs';

async function main() {
  loadEnv();
  requireEnv(['GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET']);

  const server = http.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const redirectUri = `http://127.0.0.1:${port}`;

  const oauth2Client = getOAuth2Client();
  oauth2Client.redirectUri = redirectUri;
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: OAUTH_SCOPES,
    redirect_uri: redirectUri,
  });

  console.log('\nOpen this URL in your own browser and sign in with the Google account');
  console.log('you want backups saved to, then click Allow:\n');
  console.log(authUrl);
  console.log('\nWaiting for you to approve access...');

  const code = await new Promise((resolve, reject) => {
    server.on('request', (req, res) => {
      const url = new URL(req.url, redirectUri);
      const err = url.searchParams.get('error');
      const c = url.searchParams.get('code');
      res.setHeader('Content-Type', 'text/html');
      if (err) {
        res.end(`<h2>Authorization failed: ${err}</h2>You can close this tab.`);
        reject(new Error(err));
      } else {
        res.end('<h2>Authorized ✅</h2>You can close this tab and go back to the terminal.');
        resolve(c);
      }
      server.close();
    });
  });

  const { tokens } = await oauth2Client.getToken({ code, redirect_uri: redirectUri });
  if (!tokens.refresh_token) {
    throw new Error(
      'No refresh token returned. This usually means access was already granted before ' +
      'without "prompt=consent" — go to https://myaccount.google.com/permissions, remove ' +
      'access for this app, and run authorize.mjs again.'
    );
  }

  if (saveEnvLocal('GOOGLE_OAUTH_REFRESH_TOKEN', tokens.refresh_token)) {
    console.log('\n✅ Saved GOOGLE_OAUTH_REFRESH_TOKEN to .env.backup');
  } else {
    console.log('\n✅ Refresh token obtained. Save this as the GOOGLE_OAUTH_REFRESH_TOKEN secret:');
    console.log(tokens.refresh_token);
  }
}

main().catch((err) => {
  console.error(`❌ Authorization failed: ${err.message}`);
  process.exit(1);
});
