const { logout } = require('../../utils/auth')

Page({
  data: {
    displayName: ''
  },

  onShow() {
    try {
      const user = wx.getStorageSync('userInfo') || {}
      const name = user.name || user.username || user.realname || user.nick || user.phone || ''
      this.setData({ displayName: name })
    } catch (_) {
      this.setData({ displayName: '' })
    }
  },
  // 跳转到血压录入页面
  onTapMicBp() {
    wx.navigateTo({
      url: '/pages/bp-input/index'
    });
  },
  
  // 跳转到用药页面
  onTapMicMed() {
    wx.navigateTo({
      url: '/pages/medication/index'
    });
  },
  
  // 跳转到听提醒页面
  onSpeaker() {
    wx.navigateTo({
      url: '/pages/pt-reminder/index'
    });
  },

  // 新增：跳转到"联系村医"页面（医生列表页面）
  gotoPtChat() {
    wx.navigateTo({
      url: '/pages/doctor-list/index'
    });
  },

  // 新增：跳转到“血压历史”页面（文件名 blood）
  gotoBlood() {
    // 传递患者姓名（示例：张三，可从登录信息中获取）
    const patientName = encodeURIComponent('张三');
    wx.navigateTo({
      // 路径对应“血压历史”页面的文件路径（blood）
      url: `/pages/blood/index?patientName=${patientName}`
    });
  },

  // 退出登录（患者）
  handleLogoutTap() {
    wx.showModal({
      title: '确认退出',
      content: '退出后需要重新登录',
      confirmText: '退出',
      confirmColor: '#ff6b6b',
      success(res) {
        if (res.confirm) {
          logout({ loginPath: '/pages/pt-login/index' })
        }
      }
    })
  }
});
