Page({
  goBack() {
    wx.navigateBack();
  },
  selectRemindContent() {
    wx.showToast({
      title: '选择提醒内容功能待完善',
      icon: 'none'
    })
  },
  sendRemind() {
    wx.showToast({
      title: '发送提醒功能待完善',
      icon: 'none'
    })
  }
})