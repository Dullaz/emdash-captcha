/**
 * Cloudflare Turnstile provider — verifies tokens via the siteverify endpoint
 * (`https://challenges.cloudflare.com/turnstile/v0/siteverify`) using
 * `ctx.http.fetch`. The browser renders the widget with the public `sitekey`;
 * this server-side step exchanges the resulting token + the secret for a pass.
 */
import { CaptchaNotConfiguredError, type CaptchaProvider } from "./provider";

const SITEVERIFY_URL =
	"https://challenges.cloudflare.com/turnstile/v0/siteverify";

interface SiteverifyResponse {
	success: boolean;
	"error-codes"?: string[];
}

export const turnstileProvider: CaptchaProvider = {
	id: "turnstile",
	label: "Cloudflare Turnstile",
	siteKeyField: "sitekey",
	fields: [
		{
			key: "sitekey",
			label: "Site key",
			type: "string",
			placeholder: "0x4AAAAAAA…",
			help: "Public key rendered in the widget. Safe to expose to the browser.",
		},
		{
			key: "secret",
			label: "Secret key",
			type: "secret",
			help: "Used server-side for siteverify. Never sent to the browser.",
		},
	],

	validate(config) {
		if (!config.sitekey || !config.secret) {
			return "Set both the Turnstile site key and secret key.";
		}
		return null;
	},

	async verify({ token, remoteip, config, ctx }) {
		if (!ctx.http) {
			throw new CaptchaNotConfiguredError("No network access available");
		}
		const body = new URLSearchParams();
		body.set("secret", config.secret);
		body.set("response", token);
		if (remoteip) body.set("remoteip", remoteip);

		const res = await ctx.http.fetch(SITEVERIFY_URL, {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: body.toString(),
		});
		if (!res.ok) {
			throw new Error(`Turnstile siteverify failed: HTTP ${res.status}`);
		}
		const json = (await res.json()) as SiteverifyResponse;
		return { success: json.success === true, errorCodes: json["error-codes"] };
	},
};
