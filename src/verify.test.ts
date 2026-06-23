import { describe, expect, test } from "bun:test";
import type { PluginContext } from "emdash";
import type { CaptchaConfig } from "./config";
import { turnstileProvider } from "./providers/turnstile";
import { verifyToken } from "./verify";

function fakeCtx(opts: {
	config?: Partial<CaptchaConfig> | null;
	fetchImpl?: (url: string, init: RequestInit) => Promise<Response>;
}): { ctx: PluginContext; calls: Array<{ url: string; init: RequestInit }> } {
	const calls: Array<{ url: string; init: RequestInit }> = [];
	const ctx = {
		kv: { get: async () => opts.config ?? null },
		http: {
			fetch: async (url: string, init: RequestInit) => {
				calls.push({ url, init });
				return opts.fetchImpl
					? opts.fetchImpl(url, init)
					: new Response(JSON.stringify({ success: true }), { status: 200 });
			},
		},
		log: { info() {}, warn() {}, error() {}, debug() {} },
	} as unknown as PluginContext;
	return { ctx, calls };
}

const enabledConfig: Partial<CaptchaConfig> = {
	enabled: true,
	activeProvider: "turnstile",
	providers: { turnstile: { sitekey: "0x_site", secret: "0x_secret" } },
};

describe("turnstile provider", () => {
	test("validate requires both keys", () => {
		expect(turnstileProvider.validate({})).toBeTruthy();
		expect(turnstileProvider.validate({ sitekey: "a" })).toBeTruthy();
		expect(turnstileProvider.validate({ sitekey: "a", secret: "b" })).toBeNull();
	});

	test("verify posts secret + response (+ remoteip) to siteverify", async () => {
		const { ctx, calls } = fakeCtx({});
		const r = await turnstileProvider.verify({
			token: "tok",
			remoteip: "1.2.3.4",
			config: { sitekey: "s", secret: "shh" },
			ctx,
		});
		expect(r.success).toBe(true);
		expect(calls[0].url).toBe("https://challenges.cloudflare.com/turnstile/v0/siteverify");
		const body = String(calls[0].init.body);
		expect(body).toContain("secret=shh");
		expect(body).toContain("response=tok");
		expect(body).toContain("remoteip=1.2.3.4");
	});

	test("verify surfaces error codes on failure", async () => {
		const { ctx } = fakeCtx({
			fetchImpl: async () =>
				new Response(JSON.stringify({ success: false, "error-codes": ["invalid-input-response"] }), {
					status: 200,
				}),
		});
		const r = await turnstileProvider.verify({
			token: "bad",
			config: { sitekey: "s", secret: "shh" },
			ctx,
		});
		expect(r.success).toBe(false);
		expect(r.errorCodes).toEqual(["invalid-input-response"]);
	});
});

describe("verifyToken", () => {
	test("passes (skipped) when disabled", async () => {
		const { ctx, calls } = fakeCtx({ config: { enabled: false } });
		const r = await verifyToken(ctx, "anything");
		expect(r).toEqual({ success: true, skipped: true });
		expect(calls).toHaveLength(0);
	});

	test("passes (skipped) when enabled but unconfigured", async () => {
		const { ctx, calls } = fakeCtx({
			config: { enabled: true, activeProvider: "turnstile", providers: {} },
		});
		const r = await verifyToken(ctx, "tok");
		expect(r.success).toBe(true);
		expect(r.skipped).toBe(true);
		expect(calls).toHaveLength(0);
	});

	test("fails on a missing token when enabled + configured", async () => {
		const { ctx, calls } = fakeCtx({ config: enabledConfig });
		const r = await verifyToken(ctx, "");
		expect(r.success).toBe(false);
		expect(calls).toHaveLength(0);
	});

	test("verifies the token when enabled + configured", async () => {
		const { ctx, calls } = fakeCtx({ config: enabledConfig });
		const r = await verifyToken(ctx, "tok", "9.9.9.9");
		expect(r.success).toBe(true);
		expect(calls).toHaveLength(1);
	});
});
