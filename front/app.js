// app.js
App({
  globalData: {
    API_BASE: "" // 运行时决定
  },
  onLaunch() {
    try {
      const { miniProgram } = wx.getAccountInfoSync()
      const env = miniProgram.envVersion // 'develop' | 'trial' | 'release'
      
      console.log('当前环境版本:', env)

      // 根据环境设置不同的 API 地址
      switch (env) {
        case 'develop':
          this.globalData.API_BASE = 'http://192.168.164.117:5000'; // 开发环境IP
          break;
        case 'trial':
          this.globalData.API_BASE = 'https://your-trial-server.com'; // 测试环境域名
          break;
        case 'release':
          this.globalData.API_BASE = 'https://your-production-server.com'; // 生产环境域名
          break;
        default:
          this.globalData.API_BASE = 'http://192.168.164.117:5000'; // 默认指向开发环境
          break;
      }
      
      console.log('API_BASE 设置为:', this.globalData.API_BASE)
    } catch (error) {
      console.log('获取环境信息失败:', error)
      // 默认使用开发环境地址
      this.globalData.API_BASE = 'http://192.168.164.117:5000'
      console.log('使用默认 API_BASE:', this.globalData.API_BASE)
    }
  }
})
