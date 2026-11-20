# 发布与更新

## 使用发布版本

从 GitHub Release 的说明复制 `github:tjyyy3/dsh-playground#<40 位 SHA>`，在 DSH 的第三方插件安装框安装。SHA 来自 Release 正文的 `Commit: <SHA>`，插件不通过可移动的 tag 引用推导 SHA。

DSH 插件管理器拥有安装、更新、兼容性检查和失败恢复。插件的版本卡只读，不下载压缩包或调用安装、更新 API。

不同安装来源的处理方式如下。

| 来源 | 更新方式 |
| --- | --- |
| Registry | 由 DSH 查询软件包仓库并更新兼容版本。本项目尚未发布到 npm。 |
| 固定 commit 的 Git spec | 向 DSH 插件管理器提供新 Release 的固定 Git spec。目标必须是同一仓库和 `path:` 目录，版本必须更高。 |
| 未固定 commit 的 Git spec | DSH 无法更新该来源。将 Release 的固定 Git spec 填入第三方插件安装框，覆盖安装当前副本，按提示重启。 |
| `link:` | 在链接目录更新代码，再按 DSH 提示重新加载或重启。 |
| `file:`、本地路径或压缩包 | DSH 无法更新该来源。从 GitHub Release 页面复制固定 Git spec，通过第三方插件安装框覆盖安装，按提示重启。 |
| 未知 | 在 DSH 插件管理器核对来源后选择操作。 |

未固定 commit 的 Git 仓库 URL 仍能安装，但分支、tag 和 range 都不满足 DSH 的更新要求。Host 的 `installBundle` 允许新 Git spec 在 pnpm 识别包名后覆盖安装当前副本；无 HMR 时提示 `restart-required`，有 HMR 时替换运行插件。仅当 DSH 返回 `already-installed` 时才移除后重新安装。该拒绝适用于 Host 在安装前已能识别包名的 spec，包括当前保存的同一个 Git spec，不代表切换到新固定 spec 必须先卸载。

版本卡分别显示当前运行版本和磁盘 manifest 版本。磁盘较新时需要重启 DSH。卡片的结果不能证明重新加载、重建或重启已经生效。

## 选择检查渠道

在插件配置中设置 `releaseChannel`，默认值是 `stable`。

```yaml
releaseChannel: beta
```

`stable` 选择最高的非预发布版本。`beta` 选择最高版本，包括正式版。打开卡片只读取本地版本与安装来源；点击 **检查更新** 后才查询公开 GitHub Releases。每个渠道的成功结果缓存三分钟，普通失败、超时和未找到目标的不完整结果不缓存，可立即重试。每页请求限时 20 秒，最多五页；客户端检查调用限时 120 秒，本地版本读取限时 10 秒。检查超时、请求失败、读取不完整和限流分别显示，已知限流恢复时间之前不再请求 GitHub。额度恢复后保留已有的版本目标和警告。

## 准备新 Release

1. 将 `package.json` 与锁文件的版本设为待发布版本，并新增对应的 `release-notes/<version>.md`。
2. 正式版使用 `MAJOR.MINOR.PATCH`，预发布只使用 `MAJOR.MINOR.PATCH-beta.N`，不使用 build metadata。
3. 确保版本大于每一个已有 Release tag，包括预发布。第一个按新规则发布的版本是 `0.5.1-beta.1`。旧的 `0.5.0-preview.7` 没有 Release，因为 SemVer 中 `beta` 排在 `preview` 前，后续版本不能回到 `0.5.0-beta.N`。
4. 核对 `compatibility.json` 和 release notes。`engines.dsh` 的最低版本为 `0.2.1-rc.5`，依据是已检查的 desktop runtime `desktopVersion` 与同版本的已安装 `@deepseek-ai/dsh-sdk-protocol/package.json`。它是当前可据实声明的最低 Host 版本，未证明更早版本兼容，也未完成当前版本的真实安装更新验证。
5. 合并代码并创建与 package 版本完全一致的 `v<version>` tag。
6. 手动运行 **Prepare release**，填写已有 tag。

工作流在 checkout 之前验证 tag 语法，然后验证 manifest 版本、tag commit 和 main 祖先关系，并对所有已有 Release tag 检查 SemVer 递增。它在 Windows 和 macOS 的 Node 24、26 上运行离线测试，以 `npm ci --ignore-scripts` 安装测试依赖。写权限 job 的 action 固定到完整 SHA。

Host 的 [App boot 文档](https://github.com/deepseek-ai/deepseek-harness/blob/2e39e70496aa02986ca6a820c5d497e816b69d7e/packages/boot/app-boot/README.md#L54) 明确让预发布版本参与范围匹配。[Registry 更新检查](https://github.com/deepseek-ai/deepseek-harness/blob/2e39e70496aa02986ca6a820c5d497e816b69d7e/packages/boot/plugin-manager/src/index.ts#L871) 调用 `evaluatePluginCompatibility`，其 [SemVer 检查](https://github.com/deepseek-ai/deepseek-harness/blob/2e39e70496aa02986ca6a820c5d497e816b69d7e/packages/boot/app-boot/src/plugin-compatibility.ts#L52) 使用 `includePrerelease: true`。因此 `>=0.2.1-rc.5` 接受当前 Host `0.2.1-rc.5`，也接受较新的 Host 预发布版本。

工作流创建草稿 Release，正文包含完整 commit SHA 和可粘贴的 Git spec，并附加 `compatibility.json`。不再生成 `.tgz` 或 `SHA256SUMS`，也不假定 DSH 使用 npm 安装插件。发布前核对草稿内容与预发布标志，再手动发布。

## 验证安装、更新和回退

1. 在单独的 DSH 测试配置中从 Release 的固定 spec 安装，核对来源和运行版本。
2. 用较新版本的固定 spec 执行 Host 更新，核对兼容性拒绝和安装失败恢复。
3. 分别验证刷新、重建、重启和卡片按钮，核对磁盘较新时的重启提示。
4. 回退前核对目标 Release 的兼容信息。Host 更新拒绝旧版本，可通过第三方插件安装框覆盖安装旧的固定 spec；仅当返回 `already-installed` 时才移除后重新安装。

截至此变更，Release 工作流未实际运行，真实 DSH 安装更新及上述交互尚未验证。离线测试只能证明使用伪 Host 和伪 GitHub 响应时的行为。
