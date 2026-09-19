# 高化实验台

沪科版（上海科学技术出版社）高中化学桌面学习台。五册可搜索 PDF 作为正文来源；各册教材大纲只用于章节定位，不替代原文。

## 运行

```bash
cd app
npm install
npm run dev
```

## 使用顺序

1. 打开「设置」，填入 [ZenMux](https://zenmux.ai/invite/GBQMC5) API Key（本地保险箱保存，界面只显示掩码）。
2. 建立五册教材向量索引（`openai/text-embedding-3-small`）。
3. 在教材中按大纲跳页，或在知识图谱点选考点出题。
4. 出题 / 解题走两个模型交叉，再由仲裁模型判定是否入库。

默认模型：`anthropic/claude-sonnet-5`、`openai/gpt-5.6-luna`、`x-ai/grok-4.6`。
