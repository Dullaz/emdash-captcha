/**
 * CAPTCHA provider abstraction. A provider knows how to verify a challenge
 * token server-side and what configuration fields it needs (so the admin UI can
 * render a form generically). Add new providers (hCaptcha, reCAPTCHA…) by
 * implementing this interface and registering them in `./index.ts`.
 *
 * Mirrors the email plugin's provider pattern (`packages/email/src/providers`).
 */
import type { PluginContext } from "emdash";

/** A provider's configuration values (field key → value). */
export type ProviderConfig = Record<string, string>;

export type ProviderFieldType = "string" | "secret";

export interface ProviderField {
	key: string;
	label: string;
	type: ProviderFieldType;
	placeholder?: string;
	help?: string;
}

export interface VerifyArgs {
	/** The challenge token from the browser (`cf-turnstile-response`). */
	token: string;
	/** End-user IP, when known — forwarded to the provider's siteverify. */
	remoteip?: string | null;
	config: ProviderConfig;
	ctx: PluginContext;
}

export interface VerifyResult {
	success: boolean;
	/** Provider error codes (e.g. `invalid-input-response`), for logging. */
	errorCodes?: string[];
}

export interface CaptchaProvider {
	id: string;
	label: string;
	/** Config fields the provider needs — drives the admin settings form. */
	fields: ProviderField[];
	/** Which field key holds the public site key (exposed to the browser). */
	siteKeyField: string;
	/** Return a problem message if config is incomplete, else null. */
	validate(config: ProviderConfig): string | null;
	/** Verify a token against the provider. Throws only on transport failure. */
	verify(args: VerifyArgs): Promise<VerifyResult>;
}

export class CaptchaNotConfiguredError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "CaptchaNotConfiguredError";
	}
}
