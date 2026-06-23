/**
 * Core verification logic, shared by the public `verify` route and the admin
 * `test` route. Dispatches to the active provider.
 *
 * Fail-open vs fail-closed: when the plugin is disabled or unconfigured, verify
 * is a **pass** (no-op) so the storefront keeps working before setup. Once
 * enabled with a valid provider, an invalid/absent token is a **fail**. The
 * storefront only enforces the result for actions it has gated, so a disabled
 * plugin never blocks anyone.
 */
import type { PluginContext } from "emdash";
import { loadConfig } from "./config";
import { getProvider } from "./providers";

export interface VerifyOutcome {
	success: boolean;
	/** True when verification was skipped because the plugin is off/unconfigured. */
	skipped?: boolean;
	errorCodes?: string[];
}

export async function verifyToken(
	ctx: PluginContext,
	token: string | null | undefined,
	remoteip?: string | null,
): Promise<VerifyOutcome> {
	const cfg = await loadConfig(ctx);
	if (!cfg.enabled) return { success: true, skipped: true };

	const provider = getProvider(cfg.activeProvider);
	const config = provider ? (cfg.providers[provider.id] ?? {}) : {};
	// Enabled but misconfigured → skip rather than lock customers out. The admin
	// page surfaces the misconfiguration; this avoids a self-inflicted outage.
	if (!provider || provider.validate(config)) {
		ctx.log.warn("Captcha enabled but provider not configured — skipping", {
			provider: cfg.activeProvider,
		});
		return { success: true, skipped: true };
	}

	if (!token) return { success: false };

	const result = await provider.verify({ token, remoteip, config, ctx });
	if (!result.success) {
		ctx.log.info("Captcha verification failed", {
			provider: provider.id,
			errorCodes: result.errorCodes,
		});
	}
	return { success: result.success, errorCodes: result.errorCodes };
}
