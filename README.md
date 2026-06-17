# Code-To-Chinese 1.0.0
> **把代码翻译成中文大白话的AI agent工具**

Code-To-Chinese 是一个专门帮编程新手看懂代码的小工具。你只需要在代码编辑软件里，用鼠标选中看不懂的英文代码或专业术语，然后按下快捷键 Alt+Q（或者Ctrl+Shift+A），它就会立刻弹出一个（Pixel Art）界面的小悬浮窗，帮你把复杂的编程行话转成普通人能听懂的中文解释，让你边用边学，不再被专业名词吓倒。

---

## 核心功能与用法

### 1. 两种回答模式
*   **一般模式 (General Mode)**：用最通俗的大白话告诉你这段代码在干嘛。
*   **专家模式 (Expert Mode)**：会从三个角度给你分析：这段代码的逻辑是什么、哪里有潜在隐患（比如性能或安全风险）、怎么改进更好。输出内容更专业

### 2. 智能拦截
如果你选中的不是代码或技术类内容，它会自动提示“这不是技术问题，不予处理”，避免浪费资源。

### 3. 用量显示
每次查询后，界面角落会显示本次花费了多少 Token（计费单位），让你对用量心里有数。

### 4. 极简界面与轻量化用法
没有多余的花哨装饰，文字清晰。而且你只需要填入 API 密钥，打开软件就能直接用，无需复杂配置。选中代码，按快捷键，立刻得到回答。

---

## 快速上手步骤 (Quick Start)

### 1. 下载与安装
前往 Releases 页面 下载最新的安装包并运行。

### 2. 环境初始化 (关键步骤)
Code-To-Chinese 需要连接到 AI 服务才能工作。以下是获取密钥并将其配置到软件中的完整指南：
*
第一步：获取您的 API Key
*Code-To-Chinese目前 支持以下三种主流 LLM 模型，请提前准备好至少一个 API Key：
*   **Gemini** (推荐): 访问 [Google AI Studio](https://aistudio.google.com/app/apikey) 获取。
*   **DeepSeek**: 访问 [DeepSeek Open Platform](https://platform.deepseek.com/api_keys) 获取。
*   **OpenAI**: 访问 [OpenAI Platform](https://platform.openai.com/api-keys) 获取。
*
第二步：在 Code-To-Chinese 中配置密钥
*  复制好您对API key后，鼠标不要选中任何文本
*  空按Alt+Q唤出 Code-To-Chinese，在弹出页面中回到配置API key的页面输入你的API key
*  
现在您可以开始使用Code-To-Chinese了！
