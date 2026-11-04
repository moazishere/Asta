import { en, type StringKey } from './en';

export type { StringKey } from './en';

// Minimal translation helper. When Arabic is added: create ar.ts, pick the dictionary from the device
// locale here, and call I18nManager.forceRTL(true) at startup (requires an app restart on first switch).
const dictionary: Record<StringKey, string> = en;

export function t(key: StringKey, params?: Record<string, string | number>): string {
  const template = dictionary[key];
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? `{${name}}`));
}
