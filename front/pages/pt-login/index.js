// login.js
const { request } = require('../../utils/request')

Page({
  data: {
    name: '',
    phone: '',
    password: ''
  },
  onInputName(e) { this.setData({ name: e.detail.value }); },
  onInputPhone(e) { this.setData({ phone: e.detail.value }); },
  onInputPassword(e) { this.setData({ password: e.detail.value }); },

  onTapMicName() {
    wx.showToast({ title: '开始语音识别（示例）', icon: 'none' });
  },
  onTapMicPhone() { wx.showToast({ title: '录手机号（示例）', icon: 'none' }); },
  onTapMicPassword() { wx.showToast({ title: '录密码（示例）', icon: 'none' }); },

  async onLogin() {
    const { name, phone, password } = this.data;
    if (!name || !phone || !password) {
      wx.showToast({ title: '请完整填写信息', icon: 'none' });
      return;
    }

    wx.showToast({ title: '登录中...', icon: 'loading', duration: 2000 });
    
    try {
      const result = await request('/patients/login', {
        method: 'POST',
        data: { phone, password }
      });

      if (result.ok) {
        // 保存登录信息
        wx.setStorageSync('token', result.token);
        wx.setStorageSync('userInfo', result.user);
        wx.setStorageSync('userType', result.user_type);
        // 存储用户ID（用于其他页面读取）
        wx.setStorageSync('userId', result.user.user_id);
        
        wx.showToast({ title: '登录成功', icon: 'success' });
        
        // 跳转到患者首页
        setTimeout(() => {
          wx.reLaunch({
            url: '/pages/home/index'
          });
        }, 1000);
      } else {
        wx.showToast({ title: result.error || '登录失败', icon: 'none' });
      }
    } catch (error) {
      console.error('登录错误:', error);
      wx.showToast({ 
        title: error.error || '网络错误，请重试', 
        icon: 'none' 
      });
    }
  },

  // 👉 新增跳转注册的方法
  goRegister() {
    wx.navigateTo({
      url: '/pages/pt-register/index'
    });
  }
});
