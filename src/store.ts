import { Store } from "@tauri-apps/plugin-store";

let storeInstance: Store | null = null;

async function getStore(): Promise<Store> {
  if (!storeInstance) {
    storeInstance = await Store.load(".wutzit-settings.json");
  }
  return storeInstance;
}

export interface ApiKeys {
  gemini?: string;
  deepseek?: string;
  openai?: string;
  defaultModel?: "gemini" | "deepseek" | "openai";
}

export async function saveApiKeys(keys: ApiKeys): Promise<void> {
  const store = await getStore();
  await store.set("api_keys", keys);
  await store.save();
}

export async function loadApiKeys(): Promise<ApiKeys | null> {
  let keys: ApiKeys | null = null;
  try {
    const store = await getStore();
    keys = (await store.get<ApiKeys>("api_keys")) || null;
  } catch (err) {
    // Fallback when running outside Tauri context (e.g. browser preview)
  }

  const envGemini = import.meta.env.VITE_GEMINI_KEY || "";
  const envDeepseek = import.meta.env.VITE_DEEPSEEK_KEY || "";
  const envOpenai = import.meta.env.VITE_OPENAI_KEY || "";
  const envDefaultModel = import.meta.env.VITE_DEFAULT_MODEL || "gemini";

  const mergedKeys: ApiKeys = {
    gemini: keys?.gemini || envGemini,
    deepseek: keys?.deepseek || envDeepseek,
    openai: keys?.openai || envOpenai,
    defaultModel: keys?.defaultModel || (envDefaultModel as "gemini" | "deepseek" | "openai"),
  };

  if (mergedKeys.gemini || mergedKeys.deepseek || mergedKeys.openai) {
    return mergedKeys;
  }

  return null;
}
