export const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/;

const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

type Options = {
  username: string;
  /** App URL scheme, e.g. "asta" (the app registers asta://). */
  scheme: string;
  appStoreUrl?: string;
  playStoreUrl?: string;
  nonce: string;
};

/**
 * The page a friend lands on when they tap an invite link in a chat app. "Open in Asta" uses the app's
 * custom URL scheme, which works on iOS and Android without any link-verification setup; if the app is
 * not installed the button does nothing, so the install instructions sit right below it.
 */
export function renderInvitePage({
  username,
  scheme,
  appStoreUrl,
  playStoreUrl,
  nonce,
}: Options): string {
  const user = escapeHtml(username);
  const deepLink = `${scheme}://invite/${encodeURIComponent(username)}`;
  const stores = [
    appStoreUrl ? `<a class="store" href="${escapeHtml(appStoreUrl)}">App Store</a>` : '',
    playStoreUrl ? `<a class="store" href="${escapeHtml(playStoreUrl)}">Google Play</a>` : '',
  ].join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Join @${user} on Asta</title>
<style nonce="${nonce}">
  body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
         background: #0d0d0f; color: #fff; font-family: -apple-system, system-ui, Roboto, sans-serif; }
  main { max-width: 360px; padding: 32px 24px; text-align: center; }
  h1 { font-size: 28px; margin: 0 0 8px; }
  p { color: #9b9ba3; line-height: 1.5; }
  .accent { color: #ddf247; }
  a.button { display: block; margin: 24px 0 12px; padding: 16px; border-radius: 999px;
             background: #ddf247; color: #0d0d0f; font-weight: 700; text-decoration: none; }
  a.store { display: inline-block; margin: 4px; padding: 10px 18px; border-radius: 999px;
            background: #222226; color: #fff; text-decoration: none; }
</style>
</head>
<body>
<main>
  <h1><span class="accent">@${user}</span> invited you to Asta</h1>
  <p>Track your runs, log your meals and challenge your friends.</p>
  <a class="button" id="open" href="${escapeHtml(deepLink)}">Open in Asta</a>
  <p>Don't have the app yet?</p>
  ${stores || '<p>Ask your friend how to install it, then tap this link again.</p>'}
</main>
<script nonce="${nonce}">
  // Try to open the app straight away; if it is not installed nothing happens and the page stays.
  window.location.href = document.getElementById('open').getAttribute('href');
</script>
</body>
</html>`;
}
