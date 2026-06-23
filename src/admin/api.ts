/** Authenticated calls to this plugin's routes, unwrapping the envelope and the
 *  in-band `{ __error }` result. (Mirrors the email plugin's admin api.) */
import { apiFetch } from "@emdash-cms/admin";

const API_BASE = "/_emdash/api/plugins/dullaz-captcha";

async function unwrap<T>(res: Response): Promise<T> {
	const json = (await res.json().catch(() => null)) as
		| { success?: boolean; data?: unknown; error?: { message?: string } | string }
		| null;
	if (!res.ok || (json && json.success === false)) {
		const err = json?.error;
		const message =
			(typeof err === "object" ? err?.message : err) ?? `Request failed (${res.status})`;
		throw new Error(message);
	}
	const data = json && "data" in json ? json.data : json;
	if (data && typeof data === "object" && (data as { __error?: { message?: string } }).__error) {
		throw new Error((data as { __error: { message: string } }).__error.message);
	}
	return data as T;
}

export async function pluginGet<T>(route: string): Promise<T> {
	return unwrap<T>(await apiFetch(`${API_BASE}/${route}`));
}

export async function pluginPost<T>(route: string, body: unknown): Promise<T> {
	return unwrap<T>(
		await apiFetch(`${API_BASE}/${route}`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		}),
	);
}
