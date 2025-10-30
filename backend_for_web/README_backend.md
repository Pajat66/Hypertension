# Backend (Flask)

## Quick Start
```bash
python3 -m venv venv
source venv/bin/activate  # Windows 用 venv\Scripts\activate
pip install -r requirements.txt
python app.py
# http://localhost:5000/api/ping
```
配置数据库连接：设置环境变量 `DATABASE_URL` 或编辑 `app.py` 里的默认连接串：
```
mysql+pymysql://<user>:<password>@localhost/hypertension_db
```

开发时前端走 Vite 代理到 `/api/*`；生产可将前端 `dist/` 拷到 `backend/static/`。
