# 亲缘 Relation

一个简单中文亲缘树网页。以“我”为中心记录家人，自动计算亲属称谓和反向称呼。

## 在线访问

[打开亲缘网页](https://skylankarl.github.io/Relation/)

## 主要功能

- 添加父母、子女及其他亲属，自动生成亲缘树。
- 支持血亲、姻亲、堂表亲、养亲和继亲称谓计算。
- 编辑家人姓名、称呼和备注。
- 数据保存在当前浏览器，无需注册或后端服务。

## 本地运行

直接用浏览器打开 `index.html` 即可。

也可以在项目目录运行：

```bash
python -m http.server 8000
```

然后访问 `http://localhost:8000`。

## 文件说明

- `index.html`：网页结构。
- `styles.css`：页面样式。
- `app.js`：亲缘树和页面交互。
- `relation.js`：亲属称谓计算。

网页通过 GitHub Actions 自动部署到 GitHub Pages。