// app.js
App({
  globalData: {
    API_BASE: "" // 运行时决定
  },
  onLaunch() {
    try {
      const { miniProgram } = wx.getAccountInfoSync()
      const env = miniProgram.envVersion // 'develop' | 'trial' | 'release'
      this.globalData.API_BASE = 'http://192.168.150.117:5000'  // 统一使用开发环境地址
      
      console.log('环境版本:', env)
      console.log('API_BASE设置为:', this.globalData.API_BASE)
    } catch (error) {
      console.log('获取环境信息失败:', error)
      this.globalData.API_BASE = 'http://192.168.150.117:5000/api'
      console.log('使用默认API_BASE:', this.globalData.API_BASE)
    }
  }
})
