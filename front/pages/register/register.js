// register.js
const { request } = require('../../utils/request')

Page({
  data: { 
    name: '', 
    phone: '', 
    password: '', 
    confirm: '', 
    doctorId: '',
    role: '村医',
    village: ''
  },
  
  onInputName(e) { this.setData({ name: e.detail.value }); },
  onInputPhone(e) { this.setData({ phone: e.detail.value }); },
  onInputPassword(e) { this.setData({ password: e.detail.value }); },
  onInputConfirm(e) { this.setData({ confirm: e.detail.value }); },
  onInputDoctorId(e) { this.setData({ doctorId: e.detail.value }); },
  onInputRole(e) { this.setData({ role: e.detail.value }); },
  onInputVillage(e) { this.setData({ village: e.detail.value }); },

  async onRegister() {
    const { name, phone, password, confirm, doctorId, role, village } = this.data;
    
    // 验证必填字段
    if (!name || !phone || !password || !confirm) {
      wx.showToast({ title: '请完整填写必填信息', icon: 'none' });
      return;
    }
    
    // 验证密码
    if (password !== confirm) {
      wx.showToast({ title: '两次密码不一致', icon: 'none' });
      return;
    }
    
    if (password.length < 4) {
      wx.showToast({ title: '密码长度不能少于4位', icon: 'none' });
      return;
    }
    
    // 验证手机号格式
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      wx.showToast({ title: '请输入正确的手机号', icon: 'none' });
      return;
    }

    wx.showToast({ title: '注册中...', icon: 'loading', duration: 2000 });
    
    try {
      const result = await request('/doctors/register', {
        method: 'POST',
        data: {
          name,
          phone,
          password,
          confirm_password: confirm,
          doctor_id: doctorId,
          role: role || '村医',
          village: village || ''
        }
      });

      if (result.ok) {
        wx.showToast({ title: '注册成功', icon: 'success' });
        
        // 注册成功后跳转到登录页面
        setTimeout(() => {
          wx.navigateBack();
        }, 1000);
      } else {
        wx.showToast({ title: result.error || '注册失败', icon: 'none' });
      }
    } catch (error) {
      console.error('注册错误:', error);
      wx.showToast({ 
        title: error.error || '网络错误，请重试', 
        icon: 'none' 
      });
    }
  }
});
