/**
 * Plugin API routes.
 *
 *  - `sitekey` (public)  — the browser/storefront reads the public site key and
 *    which actions are gated, to render the widget. Never returns the secret.
 *  - `verify`  (public)  — the storefront SSR layer posts the challenge token
 *    here (in-process) and proceeds only on `{ success: true }`.
 *  - `config` / `config/save` / `test` (admin) — settings UI.
 *
 * Uses an in-band error result (`{ __error }`) instead of throwing emdash's
 * PluginRouteError, which Vite can duplicate across the plugin/runner boundary
 * in dev (breaking `instanceof`). The admin client detects `__error`. (Mirrors
 * the email plugin's routes.)
 */
import { z } from "astro/zod";
import type { PluginRoute, RouteContext } from "emdash";
import { type CaptchaConfig, loadConfig, saveConfig } from "./config";
import { CAPTCHA_ACTIONS, type PublicCaptchaConfig } from "./constants";
import { getProvider, PROVIDERS } from "./providers";
import { verifyToken } from "./verify";

class CaptchaRouteError extends Error {}
const fail = (message: string) => new CaptchaRouteError(message);

function wrap(
	routes: Record<string, PluginRoute>,
): Record<string, PluginRoute> {
	const out: Record<string, PluginRoute> = {};
	for (const [name, route] of Object.entries(routes)) {
		out[name] = {
			...route,
			handler: async (ctx: RouteContext) => {
				try {
					return await route.handler(ctx);
				} catch (err) {
					if (err instanceof CaptchaRouteError) {
						return { __error: { message: err.message } };
					}
					throw err;
				}
			},
		};
	}
	return out;
}

const SECRET_FIELDS = new Set(
	PROVIDERS.flatMap((p) =>
		p.fields.filter((f) => f.type === "secret").map((f) => `${p.id}.${f.key}`),
	),
);
const isSecret = (providerId: string, key: string) =>
	SECRET_FIELDS.has(`${providerId}.${key}`);

const verifyInput = z.object({
	token: z.string().default(""),
	action: z.string().optional(),
	remoteip: z.string().optional(),
});

const saveInput = z.object({
	enabled: z.boolean(),
	activeProvider: z.string().min(1),
	values: z.record(z.string(), z.record(z.string(), z.string())),
	actions: z.record(z.string(), z.boolean()),
});

const testInput = z.object({ token: z.string().min(1) });

export function buildRoutes(): Record<string, PluginRoute> {
	return wrap({
		// ---- Public: site key + gated actions for the storefront widget -------
		sitekey: {
			public: true,
			handler: async (ctx: RouteContext): Promise<PublicCaptchaConfig> => {
				const cfg = await loadConfig(ctx);
				const provider = getProvider(cfg.activeProvider);
				const values = provider ? (cfg.providers[provider.id] ?? {}) : {};
				const sitekey = provider ? (values[provider.siteKeyField] ?? null) : null;
				return {
					enabled: cfg.enabled,
					provider: cfg.activeProvider,
					sitekey: sitekey || null,
					actions: cfg.actions,
				};
			},
		},

		// ---- Public: verify a challenge token (called in-process by storefront)
		verify: {
			public: true,
			input: verifyInput,
			handler: async (ctx: RouteContext) => {
				const { token, remoteip } = ctx.input as z.infer<typeof verifyInput>;
				const ip = remoteip || ctx.requestMeta?.ip || null;
				const outcome = await verifyToken(ctx, token, ip);
				return {
					success: outcome.success,
					skipped: outcome.skipped ?? false,
				};
			},
		},

		// ---- Admin: read current config (secrets masked) ----------------------
		config: {
			handler: async (ctx: RouteContext) => {
				const cfg = await loadConfig(ctx);
				const values: Record<string, Record<string, string>> = {};
				const secretsSet: Record<string, Record<string, boolean>> = {};
				for (const provider of PROVIDERS) {
					const stored = cfg.providers[provider.id] ?? {};
					values[provider.id] = {};
					secretsSet[provider.id] = {};
					for (const field of provider.fields) {
						if (field.type === "secret") {
							secretsSet[provider.id][field.key] = !!stored[field.key];
							values[provider.id][field.key] = "";
						} else {
							values[provider.id][field.key] = stored[field.key] ?? "";
						}
					}
				}
				return {
					enabled: cfg.enabled,
					activeProvider: cfg.activeProvider,
					actions: cfg.actions,
					knownActions: CAPTCHA_ACTIONS,
					providers: PROVIDERS.map((p) => ({
						id: p.id,
						label: p.label,
						fields: p.fields,
					})),
					values,
					secretsSet,
				};
			},
		},

		// ---- Admin: save config -----------------------------------------------
		"config/save": {
			input: saveInput,
			handler: async (ctx: RouteContext) => {
				const input = ctx.input as z.infer<typeof saveInput>;
				if (!getProvider(input.activeProvider)) {
					throw fail(`Unknown provider "${input.activeProvider}"`);
				}
				const current = await loadConfig(ctx);
				const next: CaptchaConfig = {
					enabled: input.enabled,
					activeProvider: input.activeProvider,
					providers: { ...current.providers },
					actions: { ...current.actions, ...input.actions },
				};
				for (const provider of PROVIDERS) {
					const incoming = input.values[provider.id] ?? {};
					const merged: Record<string, string> = {
						...(current.providers[provider.id] ?? {}),
					};
					for (const field of provider.fields) {
						const value = incoming[field.key];
						if (value === undefined) continue;
						// Blank secret = keep the existing value (the form never echoes it).
						if (isSecret(provider.id, field.key) && value === "") continue;
						merged[field.key] = value;
					}
					next.providers[provider.id] = merged;
				}
				// Guard against locking the storefront out: enabling requires a
				// valid active provider config.
				if (next.enabled) {
					const provider = getProvider(next.activeProvider);
					const problem = provider?.validate(next.providers[provider.id] ?? {});
					if (problem) throw fail(problem);
				}
				await saveConfig(ctx, next);
				ctx.log.info("Captcha config saved", {
					enabled: next.enabled,
					activeProvider: next.activeProvider,
				});
				return { ok: true };
			},
		},

		// ---- Admin: verify a token end-to-end with the saved config -----------
		test: {
			input: testInput,
			handler: async (ctx: RouteContext) => {
				const { token } = ctx.input as z.infer<typeof testInput>;
				const cfg = await loadConfig(ctx);
				const provider = getProvider(cfg.activeProvider);
				if (!provider) throw fail(`Provider "${cfg.activeProvider}" is not available`);
				const config = cfg.providers[provider.id] ?? {};
				const problem = provider.validate(config);
				if (problem) throw fail(problem);
				try {
					const result = await provider.verify({
						token,
						remoteip: ctx.requestMeta?.ip ?? null,
						config,
						ctx,
					});
					return { success: result.success, errorCodes: result.errorCodes ?? [] };
				} catch (err) {
					throw fail(err instanceof Error ? err.message : "Verification failed");
				}
			},
		},
	});
}
