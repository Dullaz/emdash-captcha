/** Admin UI exports for the captcha plugin (loaded via the descriptor's adminEntry). */
import type { ComponentType } from "react";
import { CaptchaSettingsPage } from "./admin/CaptchaSettingsPage";

export const pages: Record<string, ComponentType> = {
	"/settings": CaptchaSettingsPage,
};

export const widgets: Record<string, ComponentType> = {};

export const fields: Record<string, ComponentType> = {};
