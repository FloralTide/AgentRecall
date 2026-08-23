# MCP 工具入口统一为 AgentRecall Gateway
<!-- release-target: v2 -->

## Bug 修复

- MCP 页面移除了容易混淆的 Runtime Agent 绑定，Codex 与 Claude Code 现在各自只连接一个受信任的 AgentRecall Gateway，调用时不再重复请求工具批准。
- 高频 Session、Skill 工具可以直接调用，其他已启用工具通过渐进式索引按需查看和调用，避免一次加载全部工具定义。
- Workflow 的创建、更新和运行等通用工具现在会进入 Gateway 索引；第三方 MCP 返回的工具错误也会被正确标记为失败。
