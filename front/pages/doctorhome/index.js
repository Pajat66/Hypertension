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

  // 点击"患者管理"跳转到 management 页面
  gotoPatientManage() {
    wx.navigateTo({ url: '/pages/management/index' })
  },

  // 点击"患者消息"跳转到 message 页面
  gotoPatientMessage() {
    wx.navigateTo({ url: '/pages/message/index' })
  },

  // 点击"批量提醒"跳转到 reminder 页面
  gotoBatchRemind() {
    wx.navigateTo({ url: '/pages/reminder/index' })
  },

  // 退出登录（医生）
  handleLogoutTap() {
    wx.showModal({
      title: '确认退出',
      content: '退出后需要重新登录',
      confirmText: '退出',
      confirmColor: '#ff6b6b',
      success(res) {
        if (res.confirm) {
          logout({ loginPath: '/pages/login/login' })
        }
      }
    })
  }
})
