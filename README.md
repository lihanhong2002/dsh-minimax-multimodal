# DSH MiniMax Multimodal

为 DeepSeek Harness (DSH) 提供 MiniMax 图像理解、文生图、语音合成和语音转写工具。插件使用 DSH 原生工具、会话文件系统、凭据和附件接口。

## 功能

| 工具 | 用途 | 默认模型 |
|---|---|---|
| `minimax_understand_image` | 读取会话工作区中的图片并回答问题 | `MiniMax-M3` |
| `minimax_generate_image` | 根据文字生成一张图片 | `image-01` |
| `minimax_speak` | 将文字合成为 MP3 | `speech-2.8-turbo` |
| `minimax_transcribe_audio` | 将音频转成文字 | `asr-1.0` |
| `minimax_list_voices` | 列出可用的系统语音音色 | MiniMax 音色目录 |

图片生成和语音合成成功后，插件自动把文件登记到 DSH 的交付记录，显示在回复下方的文件卡片中，无需模型另行调用 `present`。卡片的预览样式由 DSH 客户端决定。

M3 用于图像理解，图片和音频生成由独立的 MiniMax 模型完成。本项目目前不提供视频理解或生成、音乐生成、音色克隆、录音按钮或实时语音通话。

## 安装

在 DSH 桌面端插件管理器中添加本地插件目录。若通过桌面端配套的 CLI 安装，可使用：

```powershell
dsh plugin --profile desktop add 'link:<插件目录的绝对路径>'
```

插件要求支持原生工具和文件交付接口的 DSH 桌面端版本。安装后在插件管理器中启用 `dsh-minimax-multimodal`。

## 配置密钥

在 DSH 凭据设置中配置 MiniMax 国内站 API Key，并提供凭据引用 `MINIMAX_CN_API_KEY`。插件通过宿主凭据服务读取密钥；也可在宿主环境中设置同名环境变量。

插件不需要把 API Key 写入源码、配置补丁、对话或仓库。已暴露的密钥应在 MiniMax 控制台撤销并重新生成。不要提交 `.env`、凭据文件、会话记录或真实接口探测结果。

## 使用示例

在 DSH 对话中提出自然语言请求，例如：

- “用 MiniMax 生成一张 16:9 的海边夕阳图片。”
- “用 MiniMax 把这段文字读成 MP3：你好，世界。”
- “用 MiniMax 看一下 `images/screenshot.png`，解释这个报错。”
- “用 MiniMax 把 `recording.mp3` 转成文字。”

识图和转写工具读取会话工作区中已有文件，遵守 DSH 文件系统权限。识图文件上限 10 MiB；音频上限 50 MiB，ASR 最长 500 秒；语音合成每次最多 3000 个字符。API 权限和可用模型由 MiniMax 账户决定。

## 开发

需要 Node.js 22 或更新版本。项目不依赖第三方 npm 包。

```sh
npm test
npm pack
```

MIT License，见 [LICENSE](LICENSE)。
