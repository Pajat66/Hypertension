# 登录和注册功能测试说明

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

### 3. 医生注册
- **接口**: `POST /api/doctors/register`
- **参数**: 
  ```json
  {
    "name": "姓名",
    "phone": "手机号",
    "password": "密码",
    "confirm_password": "确认密码",
    "role": "角色（可选，默认：村医）",
    "village": "村庄（可选）"
  }
  ```
- **返回**: 
  ```json
  {
    "ok": true,
    "message": "注册成功",
    "doctor": {
      "worker_id": 3,
      "name": "新医生",
      "phone": "13500000001",
      "role": "村医",
      "village": "测试村"
    }
  }
  ```

### 4. 患者注册
- **接口**: `POST /api/patients/register`
- **参数**: 
  ```json
  {
    "name": "姓名",
    "phone": "手机号",
    "password": "密码",
    "confirm_password": "确认密码",
    "gender": "性别（M/F/U，默认：U）",
    "village": "村庄（可选）",
    "dialect": "方言（可选，默认：普通话）"
  }
  ```
- **返回**: 
  ```json
  {
    "ok": true,
    "message": "注册成功",
    "patient": {
      "user_id": 3,
      "name": "新患者",
      "phone": "13600000001",
      "gender": "M",
      "village": "测试村",
      "dialect": "普通话"
    }
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

### 医生注册页面 (`pages/register/register.js`)
- 调用 `/api/doctors/register` 接口
- 包含姓名、手机号、密码、确认密码、医师编号、角色、村庄字段
- 注册成功后跳转到登录页面

### 患者注册页面 (`pages/pt-register/index.js`)
- 调用 `/api/patients/register` 接口
- 包含姓名、手机号、密码、确认密码、性别、村庄、方言字段
- 注册成功后跳转到登录页面

## 测试步骤

1. 启动后端服务器：
   ```bash
   python app.py
   ```

2. 使用微信开发者工具打开小程序项目

3. 测试医生注册：
   - 进入医生注册页面
   - 填写完整信息
   - 点击注册按钮

4. 测试患者注册：
   - 进入患者注册页面
   - 填写完整信息
   - 点击注册按钮

5. 测试登录：
   - 使用注册的账号进行登录测试

## 注意事项

1. 确保后端服务器运行在 `http://192.168.150.117:5000`
2. 确保数据库连接正常
3. 确保网络请求能够正常访问后端API
4. 注册和登录成功后会在本地存储中保存用户信息，包括：
   - `token`: 登录令牌
   - `userInfo`: 用户信息
   - `userType`: 用户类型（doctor/patient）

## 验证规则

### 注册验证
- 必填字段：姓名、手机号、密码、确认密码
- 密码长度：至少4位
- 手机号格式：11位数字，以1开头
- 密码一致性：两次输入的密码必须相同
- 手机号唯一性：不能重复注册

### 登录验证
- 手机号必须已注册
- 密码必须正确（当前使用手机号后4位）
