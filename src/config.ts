/** Captcha configuration, stored in the plugin's own KV. */
import type { PluginContext } from "emdash";
import { CAPTCHA_ACTIONS, CONFIG_KV_KEY } from "./constants";
import { DEFAULT_PROVIDER_ID } from "./providers";

export interface CaptchaConfig {
	/** Master switch. When false, verification is a no-op pass. */
	enabled: boolean;
	/** Which provider id is active. */
	activeProvider: string;
	/** Per-provider config values, keyed by provider id. */
	providers: Record<string, Record<string, string>>;
	/** Which storefront actions require a challenge (default true). */
	actions: Record<string, boolean>;
}

/** All known actions on by default. */
function defaultActions(): Record<string, boolean> {
	return Object.fromEntries(CAPTCHA_ACTIONS.map((a) => [a, true]));
}

export async function loadConfig(ctx: PluginContext): Promise<CaptchaConfig> {
	const stored = await ctx.kv.get<CaptchaConfig>(CONFIG_KV_KEY);
	return {
		enabled: stored?.enabled ?? false,
		activeProvider: stored?.activeProvider ?? DEFAULT_PROVIDER_ID,
		providers: stored?.providers ?? {},
		actions: { ...defaultActions(), ...(stored?.actions ?? {}) },
	};
}

export async function saveConfig(
	ctx: PluginContext,
	config: CaptchaConfig,
): Promise<void> {
	await ctx.kv.set(CONFIG_KV_KEY, config);
}
