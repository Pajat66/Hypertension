# 登录功能测试说明

## 后端API接口

### 1. 医生登录
- **接口**: `POST /api/doctors/login`
- **参数**: 
  ```json
  {
    "phone": "手机号",
    "password": "密码"
  }
  ```
- **返回**: 
  ```json
  {
    "ok": true,
    "token": "doctor_1_13700000001",
    "user": {
      "worker_id": 1,
      "name": "王医生",
      "role": "村医",
      "phone": "13700000001",
      "village": "示例村"
    },
    "user_type": "doctor"
  }
  ```

### 2. 患者登录
- **接口**: `POST /api/patients/login`
- **参数**: 
  ```json
  {
    "phone": "手机号",
    "password": "密码"
  }
  ```
- **返回**: 
  ```json
  {
    "ok": true,
    "token": "patient_1_13800000001",
    "user": {
      "user_id": 1,
      "name": "张大爷",
      "phone": "13800000001",
      "village": "示例村"
    },
    "user_type": "patient"
  }
  ```

## 测试账号

### 医生账号
- **王医生**: 13700000001 / 0001
- **刘医生**: 13600000002 / 0002

### 患者账号
- **张大爷**: 13800000001 / 0001
- **李阿姨**: 13900000002 / 0002

## 密码规则
- 当前使用手机号后4位作为密码（演示用）
- 实际项目中应该使用加密密码

## 前端实现

### 医生登录页面 (`pages/login/login.js`)
- 调用 `/api/doctors/login` 接口
- 登录成功后跳转到 `/pages/doctorhome/index`
- 保存token和用户信息到本地存储

### 患者登录页面 (`pages/pt-login/index.js`)
- 调用 `/api/patients/login` 接口
- 登录成功后跳转到 `/pages/home/index`
- 保存token和用户信息到本地存储

## 测试步骤

1. 启动后端服务器：
   ```bash
   python app.py
   ```

2. 使用微信开发者工具打开小程序项目

3. 测试医生登录：
   - 进入医生登录页面
   - 输入手机号：13700000001
   - 输入密码：0001
   - 点击登录按钮

4. 测试患者登录：
   - 进入患者登录页面
   - 输入手机号：13800000001
   - 输入密码：0001
   - 点击登录按钮

## 注意事项

1. 确保后端服务器运行在 `http://192.168.3.117:5000`
2. 确保数据库连接正常
3. 确保网络请求能够正常访问后端API
4. 登录成功后会在本地存储中保存用户信息，包括：
   - `token`: 登录令牌
   - `userInfo`: 用户信息
   - `userType`: 用户类型（doctor/patient）
