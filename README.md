# @dullaz/captcha

Bot-protection (CAPTCHA) for EmDash with a pluggable provider abstraction. Ships
a **Cloudflare Turnstile** provider; more (hCaptcha, reCAPTCHA…) can be added by
implementing one interface. Native-format plugin (runs in-process; ships a React
admin UI).

## How it fits EmDash

Unlike email, EmDash has no core "captcha" capability or cross-plugin hook, so a
plugin can't transparently intercept another plugin's routes. This plugin
therefore does two things and leaves **enforcement** to your storefront:

- Stores its own provider config (site key, secret, which actions are gated).
- Exposes two public API routes the storefront calls:
  - `sitekey` — returns the public site key + gated actions so the browser can
    render the widget. Never returns the secret.
  - `verify` — the storefront SSR layer posts the challenge token here
    (in-process) and proceeds only on `{ success: true }`.

You wire the widget into your forms and call `verify` before running the
sensitive action (see the storefront helper pattern in the Buy Some Pixels
store: a small `lib/turnstile.ts` + the account / order-lookup pages).

## Install

```js
// astro.config.mjs
import { captchaPlugin } from "@dullaz/captcha";

export default defineConfig({
  integrations: [
    emdash({
      database: d1({ binding: "DB" }),
      storage: r2({ binding: "MEDIA" }),
      plugins: [captchaPlugin()],
    }),
  ],
});
```

## Configure

Open the plugin's **Bot protection** admin page
(`/_emdash/admin/plugins/dullaz-captcha/settings`):

1. Pick a **provider** (Cloudflare Turnstile).
2. Fill its fields: **Site key** (public) and **Secret key** (write-only in the
   form — shown as "saved", blank to keep).
3. Toggle which **actions** require a challenge (sign in, create account, order
   lookup, magic-link request, password-reset request).
4. **Save**, then use **Send test token** to verify end-to-end.
5. Flip **enabled** on once a valid provider is configured (the save guard
   refuses to enable with an invalid config so you can't lock yourself out).

## API routes

Mounted at `/_emdash/api/plugins/dullaz-captcha/<route>`.

| Route         | Method | Auth   | Purpose                                   |
| ------------- | ------ | ------ | ----------------------------------------- |
| `sitekey`     | GET    | public | Public site key + gated actions           |
| `verify`      | POST   | public | Verify a challenge token (in-process)      |
| `config`      | GET    | admin  | Current config (secrets masked)            |
| `config/save` | POST   | admin  | Save provider config + gated actions       |
| `test`        | POST   | admin  | Verify a token with the saved config       |

## Architecture

| File | Role |
| ---- | ---- |
| `src/providers/provider.ts` | `CaptchaProvider` interface (`fields`/`validate`/`verify`) |
| `src/providers/turnstile.ts` | Cloudflare Turnstile siteverify via `ctx.http` |
| `src/providers/index.ts` | Provider registry |
| `src/config.ts` | Active provider + per-provider config in plugin KV |
| `src/verify.ts` | Token verification used by the public `verify` route |
| `src/constants.ts` | Dependency-free shared constants/types (`@dullaz/captcha/shared`) |
| `src/routes.ts` | Public + admin routes (secrets masked) |
| `src/admin/CaptchaSettingsPage.tsx` | Settings UI |

### Adding a provider

Implement `CaptchaProvider` and register it in `src/providers/index.ts`. Its
`fields` drive the admin form automatically; `validate()` gates enabling;
`verify()` does the siteverify call (use `ctx.http.fetch` and declare the host
in the plugin's `allowedHosts`).

## Notes

- Provider secrets are stored in the plugin's KV. This EmDash version does not
  yet encrypt plugin secrets at rest, so scope keys narrowly and rotate if
  exposed.
- A browser challenge can't protect a direct API call. Pair this with
  IP/identity rate-limiting (as the commerce plugin does) for the direct-API
  path as defence-in-depth.

## Development

```bash
bun test                            # token-verification unit tests
bunx tsc -p tsconfig.json --noEmit
```
