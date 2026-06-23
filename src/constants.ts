/**
 * Shared, dependency-free constants and types.
 *
 * Imported from every context — the plugin runtime, the React admin bundle, and
 * the Astro storefront — so this module must not import `emdash`, `react`, or
 * anything environment-specific. (Mirrors the commerce plugin's `constants.ts`.)
 */

/** Stable plugin id. Mirrors `PLUGIN_ID` in index.ts. */
export const PLUGIN_ID = "dullaz-captcha";

/** Base path for this plugin's API routes. */
export const API_BASE = `/_emdash/api/plugins/${PLUGIN_ID}`;

/** KV key holding the persisted captcha configuration. */
export const CONFIG_KV_KEY = "config";

/**
 * The storefront actions that can be individually gated behind a challenge.
 * Keep in sync with the storefront helper (`src/lib/turnstile.ts`) and the
 * pages that render the widget.
 */
export const CAPTCHA_ACTIONS = [
	"login",
	"register",
	"lookup",
	"magic",
	"reset",
] as const;

export type CaptchaAction = (typeof CAPTCHA_ACTIONS)[number];

/** Human labels for the admin toggle list. */
export const CAPTCHA_ACTION_LABELS: Record<CaptchaAction, string> = {
	login: "Sign in",
	register: "Create account",
	lookup: "Order lookup",
	magic: "Magic-link request",
	reset: "Password-reset request",
};

/**
 * Public shape returned by the `sitekey` route — safe to expose to the browser.
 * Never includes the secret. `sitekey` is null until a provider is configured.
 */
export interface PublicCaptchaConfig {
	enabled: boolean;
	provider: string;
	sitekey: string | null;
	/** Which actions require a challenge (defaults true when unset). */
	actions: Record<string, boolean>;
}
