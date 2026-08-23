# 修复 Codex 会话删除残留
<!-- release-target: both -->

## Bug 修复

- 删除本地 Codex 会话时会同步清理侧边栏状态；如果 Codex App 正在占用会话，会保留原会话并提示关闭应用后重试，避免产生无法打开的残留会话。
