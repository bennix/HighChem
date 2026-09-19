# 高中化学 AI学伴

沪科版（上海科学技术出版社）高中化学桌面学习台：五册教材精读、知识图谱、3D 分子、RAG 问答，以及高考口径出题与整卷模考。

产品页：打开仓库里的 [`docs/index.html`](docs/index.html)。

## 运行

```bash
cd app
npm install
npm run dev
```

教材 PDF / OCR 放在仓库根目录（不随 Git 与安装包分发，避免版权与签名体积）。也可设置 `HIGHCHEM_ROOT` 指向本机教材目录。

1. 打开「设置」，填入 [ZenMux](https://zenmux.ai/invite/GBQMC5) API Key。
2. 建立五册教材向量索引。
3. 在教材中按大纲跳页，或在知识图谱点选考点出题。

## 打包

需要本机已安装 Developer ID Application 证书。公证凭据只走环境变量，不要写入仓库。

```bash
export APPLE_ID='your-apple-id'
export APPLE_APP_SPECIFIC_PASSWORD='xxxx-xxxx-xxxx-xxxx'
export APPLE_TEAM_ID='5N66S29EK2'

cd app
npm run dist:mac     # 公证 DMG
npm run dist:linux   # Ubuntu .deb 与 RPM
npm run dist:win     # Windows 安装包
```

产物在 `app/release/`。安装包会把本机教材 PDF 打进 `extraResources`，因此体积较大，也不应作为公开 Release 上传受版权保护的教材。
