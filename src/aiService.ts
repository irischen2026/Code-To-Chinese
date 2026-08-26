import { loadApiKeys } from "./store";

const GENERAL_PROMPT = `你是一个专业、明快、轻盈且乐于助人的极客小助手（小天使）。请用最平实易懂的语言向我解释机器在干什么。
【称呼禁令】绝对禁止使用“兄弟”、“老铁”等任何江湖气息重的称呼；当提到我时，请省略称呼，或者使用“这里小天使帮你...”这种中性、亲切的说法，亦可以“小天使”的身份自然叙事。若在输出中检测到“兄弟”一词，必须强制重构并重写回答。
【逻辑与表意】禁止任何技术术语，禁止指出 Bug，只负责用大白话解释代码表意。提到重点代码或高亮词使用方括号 [ ] 括起来。
【受理判定】编程代码、配置文件、SQL、命令行/终端命令、正则表达式、日志、报错堆栈、API 文档片段、算法描述等均视为技术内容并正常处理。仅当输入明显为与软件开发无关的日常语文（如新闻闲聊、文学散文）时，才仅输出一行 [非技术内容] 并立即停止；否则必须正常输出解释，且不要向用户提及本判定规则。`;

const EXPERT_PROMPT = `你一位代码审计专家，同时也是专业、明快、轻盈的极客小助手。你必须指出代码中的逻辑缺陷、性能瓶颈及安全风险。
【称呼禁令】绝对禁止使用“兄弟”、“老铁”等任何江湖气息重的称呼；当提到我时，请省略称呼，或者使用“这里小天使帮你...”这种中性、亲切的说法。若在输出中检测到“兄弟”一词，必须强制重构并重写回答。
【输出格式】你可以使用深度技术术语，且必须遵循：【逻辑分析】+【已知隐患】+【改进方案】的格式进行输出。提到重点代码或高亮词使用方括号 [ ] 括起来。`;

const REFUSAL_MARKER = "[非技术内容]";

function isRefusal(text: string): boolean {
  return text.includes(REFUSAL_MARKER);
}

export interface ExplanationResult {
  text: string;
  totalTokens?: number;
  refused?: boolean;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

function buildChatCompletionsUrl(baseUrl: string): string {
  const base = baseUrl.trim().replace(/\/+$/, "");
  if (base.endsWith("/chat/completions")) return base;
  return `${base}/chat/completions`;
}

async function fetchOpenAICompatible(
  baseUrl: string,
  apiKey: string,
  model: string,
  messages: { role: "system" | "user" | "assistant"; content: string }[],
  temperature: number,
  maxTokens: number,
  extra: Record<string, unknown> | null = null
): Promise<ExplanationResult> {
  const response = await fetch(buildChatCompletionsUrl(baseUrl), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
      ...(extra || {})
    })
  });

  if (!response.ok) {
    const raw = await response.text().catch(() => "");
    let detail = "";
    try {
      detail = JSON.parse(raw)?.error?.message || "";
    } catch {
      detail = raw.slice(0, 200);
    }
    throw new Error(
      `自定义模型 API 请求失败 (${response.status})${detail ? `: ${detail}` : ""}`
    );
  }

  const data = await response.json();
  const resultText = data.choices?.[0]?.message?.content;
  if (!resultText) throw new Error("自定义模型 API 返回了空内容");
  if (isRefusal(resultText)) return { text: "", refused: true };

  return {
    text: resultText,
    totalTokens: data.usage?.total_tokens
  };
}

// In general mode the user wants fast answers, so any thinking-disabling
// extras configured for the custom provider are applied; expert mode keeps
// the model's full default capability.
async function requireCustomConfig(fastThinking: boolean): Promise<{
  baseUrl: string;
  model: string;
  extra: Record<string, unknown> | null;
}> {
  const keys = await loadApiKeys();
  if (!keys?.customBaseUrl || !keys?.customModel) {
    throw new Error("自定义模型未配置 Base URL 或模型名，请进入设置配置！");
  }

  let extra: Record<string, unknown> | null = null;
  const raw = (keys.customExtraJson || "").trim();
  if (fastThinking && raw) {
    try {
      extra = JSON.parse(raw);
    } catch {
      throw new Error("附加参数不是合法 JSON，请进入设置修正！");
    }
  }
  return { baseUrl: keys.customBaseUrl, model: keys.customModel, extra };
}

// Guard against context-length 400s on small-context models: cap the
// captured text before it enters any prompt.
const MAX_CAPTURE_CHARS = 6000;

function clampText(text: string): string {
  if (text.length <= MAX_CAPTURE_CHARS) return text;
  return text.slice(0, MAX_CAPTURE_CHARS) + "\n…（选区过长，已截断）";
}

async function getActiveApiKey(activeModel: string): Promise<string> {
  const keys = await loadApiKeys();
  if (!keys) {
    throw new Error("未检测到 API Key，请先进入配置页激活小天使！");
  }

  let apiKey = "";
  if (activeModel === "gemini") apiKey = keys.gemini || "";
  else if (activeModel === "deepseek") apiKey = keys.deepseek || "";
  else if (activeModel === "openai") apiKey = keys.openai || "";
  else if (activeModel === "custom") apiKey = keys.customApiKey || "";

  apiKey = apiKey.trim().replace(/[^\x21-\x7E]/g, "");
  if (!apiKey) {
    throw new Error(`当前选择的模型 ${activeModel.toUpperCase()} 未配置 API Key，请进入设置配置！`);
  }
  return apiKey;
}

export async function fetchExplanation(text: string, mode: "general" | "expert" = "general"): Promise<ExplanationResult> {
  text = clampText(text);
  const prompt = mode === "expert" ? EXPERT_PROMPT : GENERAL_PROMPT;
  const keys = await loadApiKeys();
  const activeModel = keys?.defaultModel || "gemini";
  const apiKey = await getActiveApiKey(activeModel);

  if (activeModel === "gemini") {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const payload = {
      systemInstruction: { parts: [{ text: prompt }] },
      contents: [{ role: "user", parts: [{ text: text }] }],
      generationConfig: { temperature: 0.4, maxOutputTokens: 800 }
    };

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData?.error?.message || `Gemini API 请求失败: ${response.status}`);
    }

    const data = await response.json();
    const resultText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!resultText) throw new Error("Gemini API 返回了空内容");
    if (isRefusal(resultText)) return { text: "", refused: true };

    return {
      text: resultText,
      totalTokens: data.usageMetadata?.totalTokenCount
    };
  } 
  
  if (activeModel === "deepseek") {
    const url = "https://api.deepseek.com/chat/completions";
    const payload = {
      model: "deepseek-chat",
      messages: [
        { role: "system", content: prompt },
        { role: "user", content: text }
      ],
      temperature: 0.5,
      max_tokens: 800
    };

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData?.error?.message || `DeepSeek API 请求失败: ${response.status}`);
    }

    const data = await response.json();
    const resultText = data.choices?.[0]?.message?.content;
    if (!resultText) throw new Error("DeepSeek API 返回了空内容");
    if (isRefusal(resultText)) return { text: "", refused: true };

    return {
      text: resultText,
      totalTokens: data.usage?.total_tokens
    };
  }

  if (activeModel === "openai") {
    const url = "https://api.openai.com/v1/chat/completions";
    const payload = {
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: prompt },
        { role: "user", content: text }
      ],
      temperature: 0.5,
      max_tokens: 800
    };

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData?.error?.message || `OpenAI API 请求失败: ${response.status}`);
    }

    const data = await response.json();
    const resultText = data.choices?.[0]?.message?.content;
    if (!resultText) throw new Error("OpenAI API 返回了空内容");
    if (isRefusal(resultText)) return { text: "", refused: true };

    return {
      text: resultText,
      totalTokens: data.usage?.total_tokens
    };
  }

  if (activeModel === "custom") {
    const { baseUrl, model, extra } = await requireCustomConfig(mode === "general");
    return fetchOpenAICompatible(
      baseUrl,
      apiKey,
      model,
      [
        { role: "system", content: prompt },
        { role: "user", content: text }
      ],
      0.5,
      800,
      extra
    );
  }

  throw new Error(`未知的模型类型: ${activeModel}`);
}

export async function fetchChatExplanation(history: ChatMessage[], mode: "general" | "expert" = "general"): Promise<ExplanationResult> {
  history = history.map((msg) => ({ ...msg, content: clampText(msg.content) }));
  const prompt = mode === "expert" ? EXPERT_PROMPT : GENERAL_PROMPT;
  const keys = await loadApiKeys();
  const activeModel = keys?.defaultModel || "gemini";
  const apiKey = await getActiveApiKey(activeModel);

  if (activeModel === "gemini") {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const payload = {
      systemInstruction: { parts: [{ text: prompt }] },
      contents: history.map((msg) => ({
        role: msg.role === "user" ? "user" : "model",
        parts: [{ text: msg.content }]
      })),
      generationConfig: { temperature: 0.5, maxOutputTokens: 800 }
    };

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData?.error?.message || `Gemini API 请求失败: ${response.status}`);
    }

    const data = await response.json();
    const resultText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!resultText) throw new Error("Gemini API 返回了空内容");
    if (isRefusal(resultText)) return { text: "", refused: true };

    return {
      text: resultText,
      totalTokens: data.usageMetadata?.totalTokenCount
    };
  }

  if (activeModel === "deepseek") {
    const url = "https://api.deepseek.com/chat/completions";
    const payload = {
      model: "deepseek-chat",
      messages: [
        { role: "system", content: prompt },
        ...history.map((msg) => ({ role: msg.role, content: msg.content }))
      ],
      temperature: 0.5,
      max_tokens: 800
    };

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData?.error?.message || `DeepSeek API 请求失败: ${response.status}`);
    }

    const data = await response.json();
    const resultText = data.choices?.[0]?.message?.content;
    if (!resultText) throw new Error("DeepSeek API 返回了空内容");
    if (isRefusal(resultText)) return { text: "", refused: true };

    return {
      text: resultText,
      totalTokens: data.usage?.total_tokens
    };
  }

  if (activeModel === "openai") {
    const url = "https://api.openai.com/v1/chat/completions";
    const payload = {
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: prompt },
        ...history.map((msg) => ({ role: msg.role, content: msg.content }))
      ],
      temperature: 0.5,
      max_tokens: 800
    };

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData?.error?.message || `OpenAI API 请求失败: ${response.status}`);
    }

    const data = await response.json();
    const resultText = data.choices?.[0]?.message?.content;
    if (!resultText) throw new Error("OpenAI API 返回了空内容");
    if (isRefusal(resultText)) return { text: "", refused: true };

    return {
      text: resultText,
      totalTokens: data.usage?.total_tokens
    };
  }

  if (activeModel === "custom") {
    const { baseUrl, model, extra } = await requireCustomConfig(mode === "general");
    return fetchOpenAICompatible(
      baseUrl,
      apiKey,
      model,
      [
        { role: "system", content: prompt },
        ...history.map((msg) => ({ role: msg.role, content: msg.content }))
      ],
      0.5,
      800,
      extra
    );
  }

  throw new Error(`未知的模型类型: ${activeModel}`);
}
