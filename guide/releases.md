# 发布与更新

## 使用发布版本

在 DSH 的第三方插件安装框填入 npm 包名安装。测试版填 `dsh-playground@beta`，正式版填 `dsh-playground`，固定版本填 `dsh-playground@<version>`。

无法访问 npm 时，从 GitHub Release 的说明复制 `github:tjyyy3/dsh-playground#<40 位 SHA>` 安装。SHA 来自 Release 正文的 `Commit: <SHA>`，插件不通过可移动的 tag 引用推导 SHA。

DSH 插件管理器拥有安装、更新、兼容性检查和失败恢复。插件的版本卡只读，不下载压缩包或调用安装、更新 API。

不同安装来源的处理方式如下。

| 来源 | 更新方式 |
| --- | --- |
| npm（registry） | DSH 只为官方插件目录提供更新按钮，第三方 npm 插件没有。安装框对已安装的同名插件返回 `already-installed`。先卸载，再安装版本卡复制的固定版本 spec，例如 `dsh-playground@0.6.0-beta.1`。卡片同时以文字提示浮动 tag `dsh-playground@beta` 或 `dsh-playground`。卸载不删除 profile 中的配置覆盖。 |
| 固定 commit 的 Git spec | 向 DSH 插件管理器提供新 Release 的固定 Git spec。目标必须是同一仓库和 `path:` 目录，版本必须更高。 |
| 未固定 commit 的 Git spec | DSH 无法更新该来源。将 Release 的固定 Git spec 填入第三方插件安装框，覆盖安装当前副本，按提示重启。 |
| `link:` | 在链接目录更新代码，再按 DSH 提示重新加载或重启。 |
| `file:`、本地路径或压缩包 | DSH 无法更新该来源。从 GitHub Release 页面复制固定 Git spec，通过第三方插件安装框覆盖安装，按提示重启。 |
| 未知 | 在 DSH 插件管理器核对来源后选择操作。 |

未固定 commit 的 Git 仓库 URL 仍能安装，但分支、tag 和 range 都不满足 DSH 的更新要求。Host 的 `installBundle` 允许新 Git spec 在 pnpm 识别包名后覆盖安装当前副本；无 HMR 时提示 `restart-required`，有 HMR 时替换运行插件。仅当 DSH 返回 `already-installed` 时才移除后重新安装。该拒绝适用于 Host 在安装前已能识别包名的 spec，包括当前保存的同一个 Git spec，不代表切换到新固定 spec 必须先卸载。

版本卡分别显示当前运行版本和磁盘 manifest 版本。磁盘较新时需要重启 DSH。卡片的结果不能证明重新加载、重建或重启已经生效。

## 从 `@playground/dsh-playground` 迁移

0.6.0 起包名改为 `dsh-playground`。DSH 按包名记录插件，新旧两个包名是两个插件。旧版用户先卸载旧插件，再安装 `dsh-playground@beta`。不要用旧版版本卡复制的 Git spec 覆盖安装：pnpm 会以新包名新增依赖，旧包仍然保留。

两个包都插入 id 为 `playground-competition` 的配置行。同时安装时，DSH 配置编辑器只列出 id 唯一的行，两者都无法编辑，工具和命令也可能重复注册。配置覆盖按 id 和包名匹配，旧包名下保存的覆盖在新包中被跳过，需要重新设置。

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
7. 核对草稿后手动发布。发布事件触发 **Publish to npm**（`.github/workflows/publish.yml`），它把同一 commit 发布到 npm。

工作流在 checkout 之前验证 tag 语法，然后验证 manifest 版本、tag commit 和 main 祖先关系，并对所有已有 Release tag 检查 SemVer 递增。它在 Windows、macOS 和 Linux 的 Node 24、26 上运行离线测试，以 `npm ci --ignore-scripts` 安装测试依赖。Linux 与发布工作流的运行环境一致。写权限 job 的 action 固定到完整 SHA。

Host 的 [App boot 文档](https://github.com/deepseek-ai/deepseek-harness/blob/2e39e70496aa02986ca6a820c5d497e816b69d7e/packages/boot/app-boot/README.md#L54) 明确让预发布版本参与范围匹配。[Registry 更新检查](https://github.com/deepseek-ai/deepseek-harness/blob/2e39e70496aa02986ca6a820c5d497e816b69d7e/packages/boot/plugin-manager/src/index.ts#L871) 调用 `evaluatePluginCompatibility`，其 [SemVer 检查](https://github.com/deepseek-ai/deepseek-harness/blob/2e39e70496aa02986ca6a820c5d497e816b69d7e/packages/boot/app-boot/src/plugin-compatibility.ts#L52) 使用 `includePrerelease: true`。因此 `>=0.2.1-rc.5` 接受当前 Host `0.2.1-rc.5`，也接受较新的 Host 预发布版本。

工作流创建草稿 Release，正文包含完整 commit SHA 和可粘贴的 Git spec，并附加 `compatibility.json`。不生成 `.tgz` 或 `SHA256SUMS`。发布前核对草稿内容与预发布标志，再手动发布。

## 发布到 npm

**Publish to npm** 在 Release 发布后运行，使用 npm trusted publishing（OIDC），不需要 npm token。它检查 tag 语法和 `v<version>`、tag commit 位于 main、Release 正文的 `Commit:` 等于 tag commit，以及预发布标志与 tag 一致。随后在 Node 24 上确认 npm 不低于 11.5.1，运行 `npm ci --ignore-scripts` 与 `npm test`。发布前用 `npm view "dsh-playground@<version>" version` 查询：该版本已在 npm 上时跳过发布并记录日志，工作流成功；返回 E404 时执行 `npm publish --provenance --access public`；其他错误使工作流失败。`-beta.N` 使用 dist-tag `beta`，正式版使用 `latest`。跳过检查之后、发布之前，工作流用 `npm view dsh-playground dist-tags.<tag>` 查询该 dist-tag 当前指向的版本，若它不低于待发布版本则失败，不会把 tag 移回旧版本；tag 或包不存在时照常发布。

首次发布由维护者手动执行，因为 npm 只能为已存在的包配置 trusted publisher。在该 tag 的干净 checkout 中运行 `npm publish --access public --tag beta`。第一个 Release 发布后，工作流查到该版本已存在，跳过发布。首次发布后，在 npmjs.com 的包设置中添加 GitHub Actions trusted publisher，各字段必须完全一致：owner `tjyyy3`，repository `dsh-playground`，workflow `publish.yml`，environment 留空。全新包的第一个版本即使用 `--tag beta` 发布，`latest` 也会指向它；正式版发布前，`dsh-playground` 不带 tag 时安装的是该测试版。

工作流失败时，Release 已经公开而 npm 可能没有新版本。修复后在 Actions 中重新运行该工作流；已发布的版本会被跳过，重跑不会重复发布。

## 验证安装、更新和回退

1. 在单独的 DSH 测试配置中分别从 `dsh-playground@beta` 和 Release 的固定 spec 安装，核对来源和运行版本。
2. npm 来源卸载后重新安装较新版本，核对配置保留；Git 来源用较新版本的固定 spec 执行 Host 更新，核对兼容性拒绝和安装失败恢复。
3. 分别验证刷新、重建、重启和卡片按钮，核对磁盘较新时的重启提示。
4. 回退前核对目标 Release 的兼容信息。npm 来源卸载后安装 `dsh-playground@<旧版本>`。Git 来源的 Host 更新拒绝旧版本，可通过第三方插件安装框覆盖安装旧的固定 spec；仅当返回 `already-installed` 时才移除后重新安装。

截至此变更，npm 发布工作流未实际运行，真实 DSH 的 npm 安装、卸载重装及上述交互尚未验证。离线测试只能证明使用伪 Host 和伪 GitHub 响应时的行为。
