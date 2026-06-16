# WutZit 1.0 👼
> **基于 AI 的像素风代码辅助诊断终端 / Retro-Pixel AI Code Diagnosis Terminal**

WutZit 是一款具有极致视觉减法设计与怀旧像素风（Pixel Art）界面的轻量级代码诊断与名词解释悬浮终端。它通过划词唤醒（Alt + Q / Ctrl + Shift + A），结合双模态分析逻辑与语义门禁，为开发者提供高响应性的极客辅助诊断体验。

---

## 核心设计与交互逻辑

### 1. 双模态诊断机制 (Dual-Mode Engine)
WutZit 提供两种完全独立的分析模态，针对不同痛点进行按需解答：
*   **一般模式 (General Mode)**：
    *   **定位**：小天使角色，用最平实易懂的大白话解释代码表意。
    *   **限制**：禁止使用高深技术术语，禁止指出 Bug，只负责梳理表意逻辑。
*   **专家模式 (Expert Mode)**：
    *   **定位**：代码审计专家，专注于发掘代码的深层隐患。
    *   **结构**：强制按照 `【逻辑分析】+ 【已知隐患】+ 【改进方案】` 的三段式进行深层次审计，指出逻辑缺陷、性能瓶颈及安全风险。

### 2. 语义门禁系统 (The Gatekeeper)
为防止非技术性内容消耗 LLM 资源，WutZit 部署了轻量级的语义准入拦截器：
*   在触发任何模式的代码解释前，会首先经过极速意图分类校验。
*   如果选中文本不属于“计算机编程、软件工程、架构或技术开发”范畴，门禁将直接拦截并提示：`此处内容非技术逻辑，WutZit 拒接受理`，不触发后续正式大模型调用。

### 3. Token 实时审计栏 (Token Realtime Audit Bar)
*   **透明开销**：界面右下角以 `10px` 极小字号和等宽字体显示本次调用的精确 Token 消耗（`本次消耗：XXX tokens`），与背景高度融合。
*   **动态更新**：当进行模式切换重算、追问或重试时，Token 栏数值将即时更新刷新。

### 4. 极致视觉减法 (Minimalist Pixel Aesthetics)
*   去除了繁杂的对话气泡边框、背景及多余的气泡箭头。
*   文字与吉祥物头像浮动于统一背景层，确保精美的印刷排版级极客风格。
*   重点词汇或代码段通过方括号 `[ ... ]` 标记，在前端会被解析并渲染为精致的灰色胶囊高亮块（`code-highlight`），避免双星号（**）等 Markdown 符号污染。

---

## 快速上手 (Quick Start)

### 1. 环境准备
确保您的本地环境已安装 [Node.js](https://nodejs.org/) (v18+) 及包管理器。

### 2. 获取 API Keys
WutZit 支持以下三种主流 LLM 模型，请提前准备好至少一个 API Key：
*   **Gemini** (推荐): 访问 [Google AI Studio](https://aistudio.google.com/app/apikey) 获取。
*   **DeepSeek**: 访问 [DeepSeek Open Platform](https://platform.deepseek.com/api_keys) 获取。
*   **OpenAI**: 访问 [OpenAI Platform](https://platform.openai.com/api-keys) 获取。

### 3. 安装与配置
1.  克隆/复制项目到本地：
    ```bash
    cd WutZit1.0
    ```
2.  安装依赖：
    ```bash
    npm install
    ```
3.  配置本地开发环境变量：
    复制 `.env.example` 并重命名为 `.env`：
    ```bash
    cp .env.example .env
    ```
    编辑 `.env` 文件，填入您的 API Keys：
    ```env
    VITE_GEMINI_KEY=您的GeminiApiKey
    VITE_DEEPSEEK_KEY=您的DeepSeekApiKey
    VITE_OPENAI_KEY=您的OpenAIApiKey
    VITE_DEFAULT_MODEL=gemini
    ```

### 4. 运行与开发
*   **Web 预览开发** (支持环境变量读取)：
    ```bash
    npm run dev
    ```
*   **Tauri 客户端开发** (支持本地安全加密存储配置)：
    ```bash
    npm run tauri dev
    ```
*   **客户端构建打包**：
    ```bash
    npm run build
    npm run tauri build
    ```

---

## GitHub 上传安全防范 (Security Guidelines)

在将项目托管至 GitHub 等公开代码仓库前，请务必执行以下安全审计：

1.  **核对 `.gitignore`**：
    确保根目录下的 `.gitignore` 包含以下过滤规则，防止私密数据泄漏：
    *   `.env`、`.env.local` 等所有本地环境变量配置文件。
    *   `.wutzit-settings.json` (本地生成的 API Key 加密存储配置文件)。
    *   `node_modules/` 依赖目录及 `dist/` 编译产物目录。
    *   `src-tauri/target/` Rust 编译产物目录。
2.  **避免硬编码 API Keys**：
    所有 API Keys 的读取必须通过 `store.ts` (本地 Tauri Store 读取) 或 `import.meta.env` 环境变量机制进行。严禁在 `aiService.ts` 等源码文件中直接写入密钥字符串。
3.  **使用 `.env.example`**：
    仅在仓库中提交占位符模板 `.env.example`，用于指示其他开发者如何配置他们的本地环境。
