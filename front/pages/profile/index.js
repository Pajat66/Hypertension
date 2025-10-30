const { request } = require("../../utils/request")

Page({
  data: { apiBase: "", pong: "" },
  onShow() {
    const app = getApp()
    this.setData({ apiBase: (app && app.globalData && app.globalData.API_BASE) || "" })
  },
  async ping() {
    try {
      const res = await request("/ping")
      this.setData({ pong: JSON.stringify(res) })
    } catch(e) {
      this.setData({ pong: "请求失败" })
    }
  }
})
