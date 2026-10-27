# DSH MiniMax Multimodal

为 DeepSeek Harness (DSH) 提供 MiniMax 联网搜索、图像理解、文生图、语音合成和语音转写工具。插件使用 DSH 原生工具、会话文件系统、凭据和附件接口。

## 功能

| 工具 | 用途 | 默认模型 |
|---|---|---|
| `minimax_web_search` | 用 MiniMax 官方搜索接口联网检索，返回标题、链接、摘要、日期和相关搜索词 | MiniMax M Plan 搜索 |
| `minimax_understand_image` | 读取会话工作区中的图片并回答问题 | 跟随当前会话模型（默认 `MiniMax-M3.1-Flash`） |
| `minimax_generate_image` | 根据文字生成一张图片 | `image-01-live` |
| `minimax_speak` | 将文字合成为 MP3 | `speech-2.8-turbo` |
| `minimax_transcribe_audio` | 将音频转成文字 | `asr-1.0` |
| `minimax_list_voices` | 列出可用的系统语音音色 | MiniMax 音色目录 |
| `minimax_list_models` | 列出各能力可用的模型与当前生效模型 | — |
| `minimax_select_model` | 切换某个能力使用的模型 | — |

图片生成和语音合成成功后，插件自动把文件登记到 DSH 的交付记录，显示在回复下方的文件卡片中，无需模型另行调用 `present`。卡片的预览样式由 DSH 客户端决定。

识图模型默认跟随用户当前会话使用的模型（宿主模型 id 会经别名表归一，例如 `minimax-m3.1-flash` → `MiniMax-M3.1-Flash`）；会话模型不是 MiniMax 模型时回退到 `MiniMax-M3.1-Flash`。图片和音频生成由独立的 MiniMax 模型完成。本项目目前不提供视频理解或生成、音乐生成、音色克隆、录音按钮、实时语音通话，也不抓取网页正文（搜索工具只返回标题、链接、摘要和日期）。

## 模型选择

模型可以在三个地方改，三者共用同一份状态：

1. **输入框下方的“⚙ MiniMax”按钮**（DSH 桌面端 Web 界面）：点击打开模型设置窗口，分别选择识图、生图、语音和转写模型，选择后立即生效。
2. **斜杠命令**：`/minimax-model` 查看当前选择，`/minimax-model vision=follow-session image=image-01-live` 切换。
3. **配置补丁** `cordis.patch.yml`：设置各项默认值。

识图能力除具体模型外还接受 `follow-session`，表示跟随用户当前会话模型。生效优先级为：显式选择 > 配置补丁 > 模型目录默认值。显式选择保存在运行中的插件实例里，重启后回到配置补丁的值。

可用模型：

| 能力 | 模型 | 简介 |
|---|---|---|
| 识图 | `MiniMax-M3.1-Flash` | 原生多模态模型，支持图视频理解 |
| 识图 | `MiniMax-M3` | 前沿多模态编码模型，百万上下文 |
| 识图 | `MiniMax-M2.7` | 递归自我改进，工程交付能力更强 |
| 识图 | `MiniMax-M2.7-highspeed` | 高速推理版本，日常响应速度更快 |
| 生图 | `image-01-live` | 手绘卡通等画风增强，风格自由调 |
| 生图 | `image-01` | 画面表现细腻，支持文生图图生图 |
| 语音 | `speech-2.8-turbo` | 最新极速版，支持四十种语言情感 |
| 语音 | `speech-2.8-hd` | 最新高清语音版，音色细节更逼真 |
| 转写 | `asr-1.0` | 语音转文字，限五百秒五十兆以内 |

## 安装

在 DSH 桌面端插件管理器中添加本地插件目录。若通过桌面端配套的 CLI 安装，可使用：

```powershell
dsh plugin --profile desktop add 'link:<插件目录的绝对路径>'
```

插件要求支持原生工具、文件交付接口和客户端插件机制的 DSH 桌面端版本。安装后在插件管理器中启用 `dsh-minimax-multimodal`。

界面下拉列表由宿主直接从插件目录读取 `lib/client.js` 提供，不需要构建步骤。安装或升级后请硬刷新界面（Ctrl+Shift+R），清掉浏览器里缓存的旧 bundle；下拉列表只在有会话时出现。

## 配置密钥

在 DSH 凭据设置中配置 MiniMax 国内站 API Key，并提供凭据引用 `MINIMAX_CN_API_KEY`。插件通过宿主凭据服务读取密钥；也可在宿主环境中设置同名环境变量。

联网搜索是 MiniMax M Plan 的能力，单独使用一个 M Plan Key。插件按 `searchCredentialRef`（默认 `MINIMAX_SEARCH_API_KEY`）取搜索密钥，取不到时回退到多模态用的 `MINIMAX_CN_API_KEY` 和 `MINIMAX_API_KEY`，因此只配一个 Key 也能运行，只是必须具备 M Plan 权限。搜索请求发往 `https://api.minimaxi.com/v1/coding_plan/search`（海外站为 `api.minimax.io`），可用 `searchHost` 覆盖为其他 MiniMax 站点地址。

| 配置项 | 默认值 | 说明 |
|---|---|---|
| `region` | `cn` | `cn` 或 `global`，决定 API 域名 |
| `credentialRef` | `MINIMAX_CN_API_KEY` | 多模态密钥的凭据引用 |
| `searchCredentialRef` | `MINIMAX_SEARCH_API_KEY` | 联网搜索密钥的凭据引用，留空则复用 `credentialRef` |
| `searchHost` | 空 | 覆盖搜索接口域名，必须是 https 地址 |
| `visionModel` | `follow-session` | 识图模型；`follow-session` 表示跟随当前会话模型 |
| `imageModel` | `image-01-live` | 生图模型 |
| `speechModel` | `speech-2.8-turbo` | 语音合成模型 |
| `transcriptionModel` | `asr-1.0` | 语音转写模型 |
| `defaultVoice` | `male-qn-qingse` | 默认音色 id |

插件不需要把 API Key 写入源码、配置补丁、对话或仓库。已暴露的密钥应在 MiniMax 控制台撤销并重新生成。不要提交 `.env`、凭据文件、会话记录或真实接口探测结果。

## 使用示例

在 DSH 对话中提出自然语言请求，例如：

- “用 MiniMax 联网搜一下 DSH 插件市场最近上新了什么。”
- “用 MiniMax 生成一张 16:9 的海边夕阳图片。”
- “用 MiniMax 把这段文字读成 MP3：你好，世界。”
- “用 MiniMax 看一下 `images/screenshot.png`，解释这个报错。”
- “用 MiniMax 把 `recording.mp3` 转成文字。”

识图和转写工具读取会话工作区中已有文件，遵守 DSH 文件系统权限。识图文件上限 10 MiB；音频上限 50 MiB，ASR 最长 500 秒；语音合成每次最多 3000 个字符；搜索关键词最长 500 字符，默认保留 5 条结果，最多 10 条。API 权限和可用模型由 MiniMax 账户决定。

## 项目结构

```text
index.mjs             插件入口、工具与命令注册
lib/api.mjs           MiniMax API 请求和响应处理
lib/client.js         DSH 客户端模型设置界面
lib/models.mjs        模型目录与选择解析
lib/selection.mjs     模型选择状态
lib/presentation.mjs  图片和语音文件交付
locale/               界面语言文件
tests/                插件和模型选择测试
cordis.patch.yml      DSH 插件默认配置
```

## 开发

需要 Node.js 22.8 或更新版本。项目不依赖第三方 npm 包。

```sh
npm test
npm pack
```

测试用 `node --test --test-isolation=none` 运行，避免在受限沙箱里派生子进程。客户端半边 `lib/client.js` 按 DSH 的 lazy-CJS 约定手写，不需要构建步骤；它内嵌的模型目录必须与 `lib/models.mjs` 一致，测试会校验这一点。

MIT License，见 [LICENSE](LICENSE)。
