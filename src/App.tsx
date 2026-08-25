import { useState, useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { loadApiKeys, saveApiKeys, ApiKeys } from "./store";
import { fetchExplanation, fetchChatExplanation, ChatMessage, verifyIntent } from "./aiService";
import "./App.css";

// 全局 JS 错误诊断横幅 (仅在 JS 崩溃时动态创建显示，正常情况下不占用 DOM)
if (typeof window !== "undefined") {
  window.onerror = function (message, source, lineno, colno) {
    const errDiv = document.createElement("div");
    errDiv.style.position = "fixed";
    errDiv.style.top = "0";
    errDiv.style.left = "0";
    errDiv.style.width = "100%";
    errDiv.style.backgroundColor = "#E74C3C";
    errDiv.style.color = "white";
    errDiv.style.zIndex = "99999";
    errDiv.style.padding = "12px";
    errDiv.style.fontFamily = "monospace";
    errDiv.style.fontSize = "12px";
    errDiv.style.border = "3px solid #1A1A1A";
    errDiv.style.boxShadow = "4px 4px 0px #000000";
    errDiv.innerText = `JS 崩溃诊断: ${message}\n位置: ${source}:${lineno}:${colno}`;
    
    const closeBtn = document.createElement("button");
    closeBtn.innerText = "X";
    closeBtn.style.float = "right";
    closeBtn.style.background = "#1A1A1A";
    closeBtn.style.color = "white";
    closeBtn.style.border = "2px solid white";
    closeBtn.style.cursor = "pointer";
    closeBtn.style.padding = "2px 6px";
    closeBtn.onclick = function() {
      errDiv.remove();
    };
    errDiv.appendChild(closeBtn);
    
    document.body.appendChild(errDiv);
    return false;
  };
}

const renderMessageContent = (content: string) => {
  const parts = content.split(/(\`.*?\`|\[.*?\])/g);
  return parts.map((part, index) => {
    if (part.startsWith("`") && part.endsWith("`")) {
      const text = part.slice(1, -1);
      return (
        <span key={index} className="code-highlight">
          {text}
        </span>
      );
    }
    if (part.startsWith("[") && part.endsWith("]")) {
      const text = part.slice(1, -1);
      return (
        <span key={index} className="code-highlight">
          {text}
        </span>
      );
    }
    return part;
  });
};

function App() {
  const [capturedText, setCapturedText] = useState<string>("");
  const [statusMsg, setStatusMsg] = useState<string>("等待划词唤醒...");
  const [isOnboarded, setIsOnboarded] = useState<boolean | null>(null);
  const [apiKeys, setApiKeys] = useState<ApiKeys>({});
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [followUpText, setFollowUpText] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"general" | "expert">("general");
  const modeRef = useRef<"general" | "expert">("general");
  const isOnboardedRef = useRef<boolean>(false);
  const [latestTokens, setLatestTokens] = useState<number | null>(null);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    if (isOnboarded !== null) {
      isOnboardedRef.current = isOnboarded;
    }
  }, [isOnboarded]);

  const runExplanation = async (text: string, currentMode: "general" | "expert") => {
    setStatusMsg("正在验证意图...");
    setIsLoading(true);
    setError(null);
    setChatHistory([]); // Clear past history for new conversation
    setLatestTokens(null);

    try {
      const isTechnical = await verifyIntent(text);
      if (!isTechnical) {
        setError("此处内容非技术逻辑，WutZit 拒接受理");
        setStatusMsg("验证拒绝！");
        return;
      }

      setStatusMsg(currentMode === "expert" ? "正在进入专家级审计，运算深度增加..." : "正在思考中...");
      const result = await fetchExplanation(text, currentMode);
      setChatHistory([
        { role: "assistant", content: result.text }
      ]);
      setLatestTokens(result.totalTokens || null);
      setStatusMsg("解码完毕！");
    } catch (err: any) {
      setError(err?.message || "网络请求失败，请检查配置与网络连接。");
      setStatusMsg("解码失败！");
    } finally {
      setIsLoading(false);
    }
  };

  // Temporary state for the Onboarding form
  const [geminiKey, setGeminiKey] = useState("");
  const [deepseekKey, setDeepseekKey] = useState("");
  const [openaiKey, setOpenaiKey] = useState("");
  const [customBaseUrl, setCustomBaseUrl] = useState("");
  const [customKey, setCustomKey] = useState("");
  const [customModelName, setCustomModelName] = useState("");
  const [selectedModel, setSelectedModel] = useState<"gemini" | "deepseek" | "openai" | "custom">("gemini");

  const handleOpenLink = async (e: React.MouseEvent, url: string) => {
    e.stopPropagation(); // Prevent card selection click bubbling
    try {
      await openUrl(url);
    } catch (err) {
      console.error("Failed to open URL:", err);
    }
  };

  useEffect(() => {
    // 1. Load settings on startup with timeout protection
    const checkOnboarding = async () => {
      const timeoutPromise = new Promise<null>((_, reject) =>
        setTimeout(() => reject(new Error("读取本地配置超时，已默认返回配置页")), 2000)
      );

      try {
        const keys = await Promise.race([
          loadApiKeys(),
          timeoutPromise
        ]);
        if (keys && (keys.gemini || keys.deepseek || keys.openai || (keys.customBaseUrl && keys.customApiKey && keys.customModel))) {
          setApiKeys(keys);
          // Reflect the persisted configuration so re-saving doesn't wipe
          // other providers' keys and the correct provider stays selected.
          setSelectedModel(keys.defaultModel || "gemini");
          setGeminiKey(keys.gemini || "");
          setDeepseekKey(keys.deepseek || "");
          setOpenaiKey(keys.openai || "");
          setCustomBaseUrl(keys.customBaseUrl || "");
          setCustomKey(keys.customApiKey || "");
          setCustomModelName(keys.customModel || "");
          setIsOnboarded(true);
          await invoke("set_config_mode", { active: false });
        } else {
          setIsOnboarded(false);
          await invoke("set_config_mode", { active: true });
        }
      } catch (err: any) {
        console.error("Failed to load API keys", err);
        setError(`配置加载警告: ${err?.message || err}`);
        setIsOnboarded(false); // 强制 fallback 到 Onboarding 界面，不卡死在加载态
        await invoke("set_config_mode", { active: true });
      }
    };
    checkOnboarding();

    // 2. Listen to selection captured event
    const unlistenPromise = listen<string>("selection-captured", async (event) => {
      setCapturedText(event.payload);
      // Before activation there is no provider to query: just keep the
      // captured text — the post-activation retry sends it once settings
      // are saved, instead of surfacing a guaranteed "no API key" error
      // on every first run.
      if (!isOnboardedRef.current) return;
      runExplanation(event.payload, modeRef.current);
    });

    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

  // Auto-scroll chat to bottom
  useEffect(() => {
    const container = document.getElementById("chat-messages-container");
    if (container) {
      setTimeout(() => {
        container.scrollTop = container.scrollHeight;
      }, 50);
    }
  }, [chatHistory, isLoading, error]);

  const handleClose = async () => {
    try {
      const window = getCurrentWindow();
      await window.hide();
    } catch (err) {
      console.error("Failed to hide window:", err);
    }
  };

  const handleBackToConfig = async () => {
    try {
      setIsOnboarded(false);
      await invoke("set_config_mode", { active: true });
    } catch (err) {
      console.error("Failed to return to config mode:", err);
    }
  };

  const handleSaveOnboarding = async (e: React.FormEvent) => {
    e.preventDefault();
    const hasCustomConfig =
      customBaseUrl.trim().length > 0 &&
      customKey.trim().length > 0 &&
      customModelName.trim().length > 0;

    if (!geminiKey && !deepseekKey && !openaiKey && !hasCustomConfig) {
      alert("请至少配置一个模型的 API Key（或完整的自定义端点）才能激活小天使！");
      return;
    }
    if (selectedModel === "custom" && !hasCustomConfig) {
      alert("选择自定义模式时，Base URL、API Key、模型名 三项都需要填写！");
      return;
    }

    const cleanGemini = geminiKey.trim().replace(/[^\x21-\x7E]/g, "");
    const cleanDeepseek = deepseekKey.trim().replace(/[^\x21-\x7E]/g, "");
    const cleanOpenai = openaiKey.trim().replace(/[^\x21-\x7E]/g, "");
    const cleanCustomBaseUrl = customBaseUrl.trim().replace(/[^\x21-\x7E]/g, "");
    const cleanCustomKey = customKey.trim().replace(/[^\x21-\x7E]/g, "");
    const cleanCustomModelName = customModelName.trim().replace(/[^\x21-\x7E]/g, "");

    const keys: ApiKeys = {
      gemini: cleanGemini,
      deepseek: cleanDeepseek,
      openai: cleanOpenai,
      customBaseUrl: hasCustomConfig ? cleanCustomBaseUrl : "",
      customApiKey: hasCustomConfig ? cleanCustomKey : "",
      customModel: hasCustomConfig ? cleanCustomModelName : "",
      defaultModel: selectedModel,
    };

    try {
      await saveApiKeys(keys);
      setApiKeys(keys);
      setError(null);
      setIsOnboarded(true);
      await invoke("set_config_mode", { active: false });
      // Auto-retry the text captured before first-time activation
      if (capturedText.trim().length > 0) {
        runExplanation(capturedText, mode);
      }
    } catch (err) {
      alert("保存设置失败，请稍后重试！");
      console.error(err);
    }
  };

  const handleSendFollowUp = async (e: React.FormEvent) => {
    e.preventDefault();
    const query = followUpText.trim();
    if (!query || isLoading) return;

    const updatedHistory = [...chatHistory, { role: "user", content: query } as const];
    setChatHistory(updatedHistory);
    setFollowUpText("");
    setIsLoading(true);
    setError(null);
    setStatusMsg("思考追问中...");

    try {
      const apiHistory = [
        { role: "user" as const, content: capturedText },
        ...updatedHistory
      ];
      const response = await fetchChatExplanation(apiHistory, mode);
      setChatHistory([...updatedHistory, { role: "assistant", content: response.text } as const]);
      setLatestTokens(response.totalTokens || null);
      setStatusMsg("回答完毕！");
    } catch (err: any) {
      setError(err?.message || "网络请求失败，请检查配置与网络连接。");
      setStatusMsg("回答失败！");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRetryFollowUp = async () => {
    if (chatHistory.length === 0 || isLoading) return;

    const lastMsg = chatHistory[chatHistory.length - 1];
    if (lastMsg.role !== "user") return;

    setIsLoading(true);
    setError(null);
    setStatusMsg("重新尝试中...");

    try {
      const apiHistory = [
        { role: "user" as const, content: capturedText },
        ...chatHistory
      ];
      const response = await fetchChatExplanation(apiHistory, mode);
      setChatHistory([...chatHistory, { role: "assistant", content: response.text } as const]);
      setLatestTokens(response.totalTokens || null);
      setStatusMsg("回答完毕！");
    } catch (err: any) {
      setError(err?.message || "网络请求失败，请检查配置与网络连接。");
      setStatusMsg("回答失败！");
    } finally {
      setIsLoading(false);
    }
  };

  const handleModeChange = async (newMode: "general" | "expert") => {
    if (newMode === mode) return;
    setMode(newMode);
    setChatHistory([]);
    setLatestTokens(null);

    if (capturedText) {
      runExplanation(capturedText, newMode);
    }
  };

  // 渲染 Loading 状态
  if (isOnboarded === null) {
    return (
      <div className="window-container">
        <div className="pixel-dialog loading-dialog">
          <div className="pixel-body">
            <div className="pixel-loader">正在读取设置...</div>
          </div>
        </div>
      </div>
    );
  }

  // 渲染 Onboarding 引导配置页 (Bento Grid)
  if (!isOnboarded) {
    return (
      <div className="window-container">
        <div className="pixel-dialog">
          <div className="pixel-header" data-tauri-drag-region>
            <div className="pixel-title" data-tauri-drag-region>
              <span className="mascot-emoji" data-tauri-drag-region>👼</span>
              <span data-tauri-drag-region>小天使配置页</span>
            </div>
            <button className="pixel-close-btn" onClick={handleClose}>
              X
            </button>
          </div>

          <form onSubmit={handleSaveOnboarding} className="pixel-body">
            <div className="bento-grid">
            {/* Bento Box 1: Welcome & Intro (Spans 2 columns) */}
            <div className="bento-box intro-box">
              <h2 className="pixel-subtitle">欢迎！激活我的魔法能力 🌟</h2>
              <p className="intro-text">
                我是解码小天使。请在下方配置至少一个大模型的 API Key。您的 Key
                将完全加密保存在您的电脑本地，不会上传至任何服务器。
              </p>
              {error && (
                <p className="intro-text" style={{ color: "#E74C3C", fontWeight: "bold", marginTop: "4px" }}>
                  ⚠️ {error}
                </p>
              )}
            </div>

            {/* Bento Box 2: Gemini Key */}
            <div
              className={`bento-box model-box ${
                selectedModel === "gemini" ? "active-model" : ""
              }`}
              onClick={() => setSelectedModel("gemini")}
            >
              <div className="box-title">
                <span>♊ Gemini Key</span>
                <input
                  type="radio"
                  name="default_model"
                  checked={selectedModel === "gemini"}
                  onChange={() => setSelectedModel("gemini")}
                />
              </div>
              <div className="box-guide">
                <span 
                  className="guide-link" 
                  onClick={(e) => handleOpenLink(e, "https://aistudio.google.com/app/apikey")}
                >
                  [获取指南]
                </span>
              </div>
              <input
                type="password"
                className="pixel-input"
                placeholder="AIzaSy..."
                value={geminiKey}
                onChange={(e) => setGeminiKey(e.target.value)}
                onClick={(e) => e.stopPropagation()}
              />
            </div>

            {/* Bento Box 3: DeepSeek Key */}
            <div
              className={`bento-box model-box ${
                selectedModel === "deepseek" ? "active-model" : ""
              }`}
              onClick={() => setSelectedModel("deepseek")}
            >
              <div className="box-title">
                <span>🐳 DeepSeek Key</span>
                <input
                  type="radio"
                  name="default_model"
                  checked={selectedModel === "deepseek"}
                  onChange={() => setSelectedModel("deepseek")}
                />
              </div>
              <div className="box-guide">
                <span 
                  className="guide-link" 
                  onClick={(e) => handleOpenLink(e, "https://platform.deepseek.com/api_keys")}
                >
                  [获取指南]
                </span>
              </div>
              <input
                type="password"
                className="pixel-input"
                placeholder="sk-..."
                value={deepseekKey}
                onChange={(e) => setDeepseekKey(e.target.value)}
                onClick={(e) => e.stopPropagation()}
              />
            </div>

            {/* Bento Box 4: OpenAI Key */}
            <div
              className={`bento-box model-box ${
                selectedModel === "openai" ? "active-model" : ""
              }`}
              onClick={() => setSelectedModel("openai")}
            >
              <div className="box-title">
                <span>⚡ OpenAI Key</span>
                <input
                  type="radio"
                  name="default_model"
                  checked={selectedModel === "openai"}
                  onChange={() => setSelectedModel("openai")}
                />
              </div>
              <div className="box-guide">
                <span 
                  className="guide-link" 
                  onClick={(e) => handleOpenLink(e, "https://platform.openai.com/api-keys")}
                >
                  [获取指南]
                </span>
              </div>
              <input
                type="password"
                className="pixel-input"
                placeholder="sk-proj-..."
                value={openaiKey}
                onChange={(e) => setOpenaiKey(e.target.value)}
                onClick={(e) => e.stopPropagation()}
              />
            </div>

            {/* Bento Box 4b: Custom OpenAI-compatible endpoint */}
            <div
              className={`bento-box model-box ${
                selectedModel === "custom" ? "active-model" : ""
              }`}
              onClick={() => setSelectedModel("custom")}
            >
              <div className="box-title">
                <span>🔧 自定义 (OpenAI 兼容)</span>
                <input
                  type="radio"
                  name="default_model"
                  checked={selectedModel === "custom"}
                  onChange={() => setSelectedModel("custom")}
                />
              </div>
              <div className="box-guide">
                <span className="guide-link">Kimi / 硅基流动 / OpenRouter / Ollama 等</span>
              </div>
              <input
                type="text"
                className="pixel-input"
                placeholder="Base URL，如 https://api.siliconflow.cn/v1"
                value={customBaseUrl}
                onChange={(e) => setCustomBaseUrl(e.target.value)}
                onClick={(e) => e.stopPropagation()}
              />
              <input
                type="password"
                className="pixel-input"
                placeholder="API Key，如 sk-..."
                value={customKey}
                onChange={(e) => setCustomKey(e.target.value)}
                onClick={(e) => e.stopPropagation()}
              />
              <input
                type="text"
                className="pixel-input"
                placeholder="模型名，如 moonshot-v1-8k"
                value={customModelName}
                onChange={(e) => setCustomModelName(e.target.value)}
                onClick={(e) => e.stopPropagation()}
              />
            </div>
            </div>

            {/* Action bar pinned below the scrollable grid */}
            <div className="bento-box action-box">
              <div className="default-indicator">
                当前激活默认模型:{" "}
                <strong>
                  {selectedModel === "gemini"
                    ? "Gemini"
                    : selectedModel === "deepseek"
                    ? "DeepSeek"
                    : selectedModel === "openai"
                    ? "OpenAI"
                    : `自定义 (${customModelName || "未填模型名"})`}
                </strong>
              </div>
              <button type="submit" className="pixel-btn pixel-btn-primary">
                确认激活 & 唤醒小天使
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // 正常待命交互页 (Stage 1 / 2)
  return (
    <div className="window-container">
      <div className="pixel-dialog" data-tauri-drag-region>
        {/* Hided .pixel-header in active mode to make it a pure floating card */}
        
        <div className="pixel-body" data-tauri-drag-region>
          {capturedText && (
            <div className="selected-text-container">
              <span className="selected-text-label">选中的上下文:</span>
              <div className="selected-text-box">
                <code>{capturedText}</code>
              </div>
            </div>
          )}

          <div className="mascot-section" data-tauri-drag-region>
            <svg
              className={`pixel-mascot ${isLoading ? "loading" : ""}`}
              viewBox="0 0 16 16"
              width="64"
              height="64"
              shapeRendering="crispEdges"
            >
              <rect x="5" y="2" width="6" height="2" fill="#F4D03F" />
              <rect x="4" y="3" width="8" height="2" fill="#F4D03F" />
              <rect x="5" y="5" width="6" height="4" fill="#FDEBD0" />
              <rect x="6" y="6" width="1" height="1" fill="#1A1A1A" />
              <rect x="9" y="6" width="1" height="1" fill="#1A1A1A" />
              <rect x="5" y="7" width="1" height="1" fill="#F1948A" />
              <rect x="10" y="7" width="1" height="1" fill="#F1948A" />
              <rect x="6" y="0" width="4" height="1" fill="#F5B041" />
              <rect x="2" y="4" width="2" height="4" fill="#AED6F1" />
              <rect x="12" y="4" width="2" height="4" fill="#AED6F1" />
              <rect x="3" y="3" width="1" height="1" fill="#AED6F1" />
              <rect x="12" y="3" width="1" height="1" fill="#AED6F1" />
              <rect x="5" y="9" width="6" height="5" fill="#FFFFFF" />
              <path
                d="M 5 1 H 11 V 2 H 12 V 5 H 13 V 9 H 12 V 14 H 4 V 9 H 3 V 5 H 4 V 2 H 5 V 1 Z"
                fill="none"
                stroke="#1A1A1A"
                strokeWidth="1"
              />
            </svg>
            <div className={`dialog-bubble bubble-chat ${error && chatHistory.length === 0 ? "bubble-error" : ""}`}>
              {/* Toggle 模式切换开关 */}
              <div className="mode-toggle-container">
                <span className="mode-toggle-label">分析模式:</span>
                <div className="toggle-switch">
                  <button 
                    type="button"
                    className={`toggle-btn ${mode === "general" ? "active" : ""}`}
                    onClick={() => handleModeChange("general")}
                  >
                    一般
                  </button>
                  <button 
                    type="button"
                    className={`toggle-btn ${mode === "expert" ? "active" : ""}`}
                    onClick={() => handleModeChange("expert")}
                  >
                    专家
                  </button>
                </div>
              </div>

              {/* 中间的内容滚动区 */}
              <div className="chat-messages-scroll-area" id="chat-messages-container">
                {error && chatHistory.length === 0 ? (
                  <div className="error-message">
                    <p className="error-title">⚠️ 魔法失败 (Error)</p>
                    <p className="bubble-text">{error}</p>
                    <button 
                      className="pixel-btn-error" 
                      onClick={handleBackToConfig}
                    >
                      修改 API Key
                    </button>
                  </div>
                ) : chatHistory.length > 0 ? (
                  <>
                    {chatHistory
                      .filter((msg) => msg.role === "assistant")
                      .map((msg, idx) => (
                        <div key={idx} className="chat-message assistant">
                          <span className="message-sender">👼 小天使</span>
                          <div className="message-text">
                            {renderMessageContent(msg.content)}
                          </div>
                        </div>
                      ))}
                    {isLoading && (
                      <div className="chat-message assistant loading">
                        <span className="message-sender">👼 小天使</span>
                        <div className="message-text">
                          <span className="pixel-loading-dots">
                            {mode === "expert" ? "正在进入专家级审计，运算深度增加..." : "正在思考中... ✨"}
                          </span>
                        </div>
                      </div>
                    )}
                    {error && (
                      <div className="chat-message error">
                        <span className="message-sender">⚠️ 错误</span>
                        <div className="message-text">
                          {error}
                          <button className="chat-retry-btn" onClick={handleRetryFollowUp}>
                            重试
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                ) : isLoading ? (
                  <div className={`loading-message ${mode === "expert" ? "expert-loading" : ""}`}>
                    <p className="bubble-text loading-text">
                      {mode === "expert" ? "正在进入专家级审计，运算深度增加..." : "正在全力解码中... 🔍"}
                    </p>
                    <span className="pixel-loading-dots">✨✨✨</span>
                  </div>
                ) : (
                  <div className="welcome-message">
                    <p className="bubble-text">
                      配置成功！我是解码小天使。请选中一段代码或名词，然后按下快捷键：
                    </p>
                    <div className="shortcut-tags">
                      <span className="pixel-tag">Alt + Q</span>
                      <span className="tag-or">或</span>
                      <span className="pixel-tag">Ctrl + Shift + A</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Token 实时审计栏 */}
              {latestTokens !== null && (
                <div className="token-audit-bar">
                  本次消耗：{latestTokens} tokens
                </div>
              )}

              {/* 固定底部的追问框 */}
              <form onSubmit={handleSendFollowUp} className="follow-up-form">
                <input
                  type="text"
                  className="follow-up-input"
                  placeholder="继续追问小天使..."
                  value={followUpText}
                  onChange={(e) => setFollowUpText(e.target.value)}
                  disabled={isLoading}
                />
                <button 
                  type="submit" 
                  className="follow-up-btn" 
                  disabled={isLoading || !followUpText.trim()}
                >
                  发送
                </button>
              </form>
            </div>
          </div>
        </div>

        <div className="pixel-footer" data-tauri-drag-region>
          <div className="footer-left">
            <button className="pixel-back-btn" onClick={handleBackToConfig}>
              ⚙️ 返回配置
            </button>
          </div>
          <div className="footer-right">
            <span>{statusMsg} | {apiKeys.defaultModel === "custom" ? apiKeys.customModel : apiKeys.defaultModel?.toUpperCase()}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
