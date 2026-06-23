/**
 * @dullaz/captcha — EmDash bot-protection (CAPTCHA) plugin
 *
 * Bot-protection for EmDash. Stores its own provider config (Cloudflare
 * Turnstile first; the abstraction in `src/providers/` makes hCaptcha/reCAPTCHA
 * straightforward) and exposes two public routes:
 *
 *  - `sitekey` — the storefront reads the public site key + gated actions to
 *    render the widget.
 *  - `verify`  — the storefront SSR layer posts the challenge token here
 *    (in-process) before running a sensitive action.
 *
 * EmDash has no core "captcha" capability or cross-plugin hook (unlike email),
 * so this plugin can't intercept another plugin's routes. Enforcement therefore
 * lives in the storefront SSR layer (`src/lib/turnstile.ts` + the account /
 * order-lookup pages), which already invokes plugin routes in-process. The
 * commerce plugin adds IP/identity rate-limiting as defence-in-depth for the
 * direct-API path that a browser challenge cannot cover.
 */
import { definePlugin } from "emdash";
import type { PluginContext, PluginDescriptor } from "emdash";
import { buildRoutes } from "./routes";

export const PLUGIN_ID = "dullaz-captcha";
export const PLUGIN_VERSION = "0.1.0";
const ENTRYPOINT = "@dullaz/captcha";
const ADMIN_ENTRY = "@dullaz/captcha/admin";

// biome-ignore lint/suspicious/noEmptyInterface: reserved for future options
export interface CaptchaPluginOptions {}

export function captchaPlugin(
	options: CaptchaPluginOptions = {},
): PluginDescriptor<CaptchaPluginOptions> {
	return {
		id: PLUGIN_ID,
		version: PLUGIN_VERSION,
		entrypoint: ENTRYPOINT,
		adminEntry: ADMIN_ENTRY,
		format: "native",
		adminPages: [{ path: "/settings", label: "Bot protection", icon: "shield" }],
		options,
	};
}

export function createPlugin(_options: CaptchaPluginOptions = {}) {
	return definePlugin({
		id: PLUGIN_ID,
		version: PLUGIN_VERSION,
		// network:request to call the provider's siteverify endpoint.
		capabilities: ["network:request"],
		allowedHosts: ["challenges.cloudflare.com"],
		hooks: {
			"plugin:install": {
				handler: async (_event: unknown, ctx: PluginContext) => {
					ctx.log.info("Captcha plugin installed");
				},
			},
		},
		routes: buildRoutes(),
		admin: {
			entry: ADMIN_ENTRY,
			pages: [{ path: "/settings", label: "Bot protection", icon: "shield" }],
		},
	});
}

export default createPlugin;
