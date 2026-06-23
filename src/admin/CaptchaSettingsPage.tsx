/** Admin page: configure the captcha provider, choose which actions to gate,
 *  and verify the setup end-to-end with a live widget. */
import { useEffect, useMemo, useRef, useState } from "react";
import { pluginGet, pluginPost } from "./api";

interface ProviderField {
	key: string;
	label: string;
	type: "string" | "secret";
	placeholder?: string;
	help?: string;
}
interface ConfigResp {
	enabled: boolean;
	activeProvider: string;
	actions: Record<string, boolean>;
	knownActions: string[];
	providers: Array<{ id: string; label: string; fields: ProviderField[] }>;
	values: Record<string, Record<string, string>>;
	secretsSet: Record<string, Record<string, boolean>>;
}

const ACTION_LABELS: Record<string, string> = {
	login: "Sign in",
	register: "Create account",
	lookup: "Order lookup",
	magic: "Magic-link request",
	reset: "Password-reset request",
};

const ui = {
	page: { maxWidth: 640, display: "flex", flexDirection: "column", gap: 18 } as const,
	card: {
		border: "1px solid var(--border, #e2e2e2)",
		borderRadius: 10,
		padding: 20,
		display: "flex",
		flexDirection: "column",
		gap: 14,
	} as const,
	row: { display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" } as const,
	label: { fontSize: 13, fontWeight: 600, display: "block" } as const,
	input: {
		width: "100%",
		padding: "8px 10px",
		borderRadius: 8,
		border: "1px solid var(--border, #ccc)",
		fontSize: 14,
	} as const,
	btn: {
		padding: "8px 14px",
		borderRadius: 8,
		border: "1px solid var(--border, #ccc)",
		background: "var(--accent, #111)",
		color: "#fff",
		fontSize: 14,
		fontWeight: 600,
		cursor: "pointer",
	} as const,
	check: { display: "flex", gap: 8, alignItems: "center", fontSize: 14, fontWeight: 500 } as const,
	help: { fontSize: 12, color: "#777", marginTop: 4 } as const,
};

const TURNSTILE_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js";

declare global {
	interface Window {
		turnstile?: {
			render: (
				el: HTMLElement,
				opts: { sitekey: string; callback: (token: string) => void; "error-callback"?: () => void },
			) => string;
			reset: (id?: string) => void;
		};
	}
}

function loadTurnstileScript(): Promise<void> {
	return new Promise((resolve, reject) => {
		if (window.turnstile) return resolve();
		const existing = document.querySelector<HTMLScriptElement>(`script[src="${TURNSTILE_SRC}"]`);
		if (existing) {
			existing.addEventListener("load", () => resolve());
			existing.addEventListener("error", () => reject(new Error("Failed to load Turnstile")));
			return;
		}
		const s = document.createElement("script");
		s.src = TURNSTILE_SRC;
		s.async = true;
		s.defer = true;
		s.onload = () => resolve();
		s.onerror = () => reject(new Error("Failed to load Turnstile"));
		document.head.appendChild(s);
	});
}

export function CaptchaSettingsPage() {
	const [resp, setResp] = useState<ConfigResp | null>(null);
	const [enabled, setEnabled] = useState(false);
	const [active, setActive] = useState("");
	const [values, setValues] = useState<Record<string, Record<string, string>>>({});
	const [actions, setActions] = useState<Record<string, boolean>>({});
	const [loading, setLoading] = useState(true);
	const [busy, setBusy] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [notice, setNotice] = useState<string | null>(null);

	const widgetRef = useRef<HTMLDivElement | null>(null);
	const [testToken, setTestToken] = useState<string | null>(null);

	async function refresh() {
		const c = await pluginGet<ConfigResp>("config");
		setResp(c);
		setEnabled(c.enabled);
		setActive(c.activeProvider);
		setValues(c.values);
		setActions(c.actions);
	}

	useEffect(() => {
		refresh()
			.catch((e) => setError(String(e?.message ?? e)))
			.finally(() => setLoading(false));
	}, []);

	const provider = useMemo(() => resp?.providers.find((p) => p.id === active), [resp, active]);
	const savedSitekey = resp?.values?.[active]?.sitekey ?? "";

	// Render the Turnstile widget for the saved sitekey so the admin can verify
	// the full token → siteverify path.
	useEffect(() => {
		if (active !== "turnstile" || !savedSitekey || !widgetRef.current) return;
		let cancelled = false;
		loadTurnstileScript()
			.then(() => {
				if (cancelled || !widgetRef.current || !window.turnstile) return;
				widgetRef.current.innerHTML = "";
				window.turnstile.render(widgetRef.current, {
					sitekey: savedSitekey,
					callback: (token: string) => setTestToken(token),
					"error-callback": () => setTestToken(null),
				});
			})
			.catch((e) => setError(String(e?.message ?? e)));
		return () => {
			cancelled = true;
		};
	}, [active, savedSitekey]);

	function setField(providerId: string, key: string, value: string) {
		setValues((v) => ({ ...v, [providerId]: { ...(v[providerId] ?? {}), [key]: value } }));
	}

	function run(label: string, fn: () => Promise<void>) {
		setBusy(label);
		setError(null);
		setNotice(null);
		fn()
			.catch((e) => setError(String(e?.message ?? e)))
			.finally(() => setBusy(null));
	}

	function handleSave() {
		run("save", async () => {
			await pluginPost("config/save", { enabled, activeProvider: active, values, actions });
			setNotice("Saved.");
			await refresh();
		});
	}

	function handleTest() {
		run("test", async () => {
			if (!testToken) throw new Error("Solve the challenge above first.");
			const r = await pluginPost<{ success: boolean; errorCodes: string[] }>("test", {
				token: testToken,
			});
			if (r.success) setNotice("Verification succeeded — your setup works.");
			else throw new Error(`Verification failed: ${r.errorCodes.join(", ") || "rejected"}`);
			setTestToken(null);
			window.turnstile?.reset();
		});
	}

	if (loading) return <p style={{ padding: 20 }}>Loading bot-protection settings…</p>;

	const knownActions = resp?.knownActions ?? [];

	return (
		<div style={ui.page}>
			<div>
				<h1 style={{ margin: "0 0 4px" }}>Bot protection</h1>
				<p style={{ margin: 0, color: "#666" }}>
					Require a CAPTCHA challenge on sensitive storefront forms. Verification runs
					server-side; the storefront enforces it for the actions you enable below.
				</p>
			</div>

			{error && <div style={{ ...ui.card, borderColor: "#b3261e", color: "#b3261e" }}>{error}</div>}
			{notice && <div style={{ ...ui.card, borderColor: "#1a7f3c", color: "#1a7f3c" }}>{notice}</div>}

			<div style={ui.card}>
				<label style={ui.check}>
					<input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
					Enable bot protection
				</label>

				<label style={ui.label}>
					Provider
					<select
						style={{ ...ui.input, marginTop: 6 }}
						value={active}
						onChange={(e) => setActive(e.target.value)}
					>
						{resp?.providers.map((p) => (
							<option key={p.id} value={p.id}>
								{p.label}
							</option>
						))}
					</select>
				</label>

				{provider?.fields.map((f) => {
					const secretSet = resp?.secretsSet?.[provider.id]?.[f.key];
					return (
						<label key={f.key} style={ui.label}>
							{f.label}
							<input
								style={{ ...ui.input, marginTop: 6 }}
								type={f.type === "secret" ? "password" : "text"}
								value={values[provider.id]?.[f.key] ?? ""}
								placeholder={
									f.type === "secret" && secretSet
										? "•••••••• (saved — leave blank to keep)"
										: f.placeholder
								}
								onChange={(e) => setField(provider.id, f.key, e.target.value)}
							/>
							{f.help && <div style={ui.help}>{f.help}</div>}
						</label>
					);
				})}
			</div>

			<div style={ui.card}>
				<h2 style={{ margin: 0, fontSize: 16 }}>Protected actions</h2>
				<p style={{ margin: 0, color: "#666", fontSize: 13 }}>
					Which storefront forms require a challenge.
				</p>
				{knownActions.map((a) => (
					<label key={a} style={ui.check}>
						<input
							type="checkbox"
							checked={actions[a] ?? true}
							onChange={(e) => setActions((m) => ({ ...m, [a]: e.target.checked }))}
						/>
						{ACTION_LABELS[a] ?? a}
					</label>
				))}
			</div>

			<div style={ui.row}>
				<button style={ui.btn} onClick={handleSave} disabled={busy === "save"} type="button">
					{busy === "save" ? "Saving…" : "Save"}
				</button>
			</div>

			<div style={ui.card}>
				<h2 style={{ margin: 0, fontSize: 16 }}>Verify setup</h2>
				<p style={{ margin: 0, color: "#666", fontSize: 13 }}>
					Solve the challenge below, then verify it against the saved secret. Requires a saved
					site key whose allowed domains include this admin host.
				</p>
				{active === "turnstile" && savedSitekey ? (
					<>
						<div ref={widgetRef} />
						<div style={ui.row}>
							<button
								style={ui.btn}
								onClick={handleTest}
								disabled={busy === "test" || !testToken}
								type="button"
							>
								{busy === "test" ? "Verifying…" : "Verify token"}
							</button>
						</div>
					</>
				) : (
					<p style={{ margin: 0, color: "#999", fontSize: 13 }}>
						Save a site key first to verify your setup.
					</p>
				)}
			</div>
		</div>
	);
}
