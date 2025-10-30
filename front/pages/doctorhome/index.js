Page({
  // 点击"患者管理"跳转到 management 页面
  gotoPatientManage() {
    wx.navigateTo({
      url: '/pages/management/index',
    })
  },

  // 点击"患者消息"跳转到 message 页面（患者消息列表）
  gotoPatientMessage() {
    wx.navigateTo({
      url: '/pages/message/index',
    })
  },

  // 点击"批量提醒"跳转到 reminder 页面
  gotoBatchRemind() {
    wx.navigateTo({
      url: '/pages/reminder/index',
    })
  }
})