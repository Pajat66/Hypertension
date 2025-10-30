Page({
  onLoad() {
    // 用 reLaunch 避免返回栈里停留在 index
    wx.reLaunch({ url: "/pages/home/index" })
  }
})
