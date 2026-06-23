/** Provider registry. Add new providers here to make them selectable. */
import { turnstileProvider } from "./turnstile";
import type { CaptchaProvider } from "./provider";

export const PROVIDERS: CaptchaProvider[] = [turnstileProvider];
export const DEFAULT_PROVIDER_ID = "turnstile";

export function getProvider(
	id: string | undefined | null,
): CaptchaProvider | undefined {
	return PROVIDERS.find((p) => p.id === id);
}

export * from "./provider";
