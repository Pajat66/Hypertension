Page({
  goBack() {
    wx.navigateBack();
  },
  gotoPatientDetail() {
    wx.navigateTo({
      url: '/pages/blood/index', // 跳转到血压历史页面
    })
  },
  addPatient() {
    wx.showToast({
      title: '添加患者功能待完善',
      icon: 'none'
    })
  },
  playPatientMessage(e) {
    wx.showToast({
      title: '播放患者消息',
      icon: 'none'
    })
  },
  // 新增：患者消息按钮点击事件
  gotoPatientMessage() {
     wx.navigateTo({
     url: '/pages/message/index', // 你的患者消息页面路径
     })
    wx.showToast({
      title: '进入患者消息页面',
      icon: 'none'
    })
  }
})