# 错题本 📒

一个纯前端的错题收集网页应用。数据存在浏览器本地（localStorage），无需服务器和账号。

## 功能

- 📝 记录错题：科目、题目、答案、错因、错因说明、标签、掌握程度
- 📷 题目截图：支持粘贴（Ctrl/Cmd＋V）、拖拽、上传，自动压缩
- 🔍 OCR 识别题目：对截图里的印刷体题目做文字识别，自动填入题目栏（Tesseract.js，首次使用需联网下载中文模型）
- 🤖 豆包 AI 识别：接入火山方舟豆包视觉模型，能读手写和公式，比本地 OCR 更准（在「⚙️ 设置」里填 API Key）
- 🔍 搜索 + 按科目 / 掌握度筛选
- 🔁 艾宾浩斯复习排期：点「复习」自动安排下次复习时间（1、2、4、7、15、30、60 天）
- ⭐ 重点标记：一键标记重点题目，卡片高亮置顶，可单独筛选
- 📊 顶栏统计：总题数、今日待复习、未掌握数量
- 💾 一键导出 / 导入 JSON 备份

## 本地运行

直接用浏览器打开 `index.html` 即可，无需安装任何东西。

## 部署到 GitHub Pages（在线调试）

1. 在 GitHub 新建一个仓库（例如 `cuoti-collector`）。
2. 把本目录推上去：

```bash
git init
git add .
git commit -m "init 错题本"
git branch -M main
git remote add origin https://github.com/<你的用户名>/cuoti-collector.git
git push -u origin main
```

3. 打开仓库 **Settings → Pages**，在 *Branch* 下拉里选 `main`、目录选 `/ (root)`，点 Save。
4. 稍等一分钟，页面地址会显示在 Settings → Pages 顶部，形如：

```
https://<你的用户名>.github.io/cuoti-collector/
```

## 注意

- 数据只存在**当前浏览器**里，换设备或清缓存会丢失。记得定期用「导出」备份，换设备后用「导入」恢复。
- 截图会占用 localStorage 空间（约 5MB 上限），已做压缩处理，但仍建议控制截图数量。
