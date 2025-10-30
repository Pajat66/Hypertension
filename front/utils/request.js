const app = getApp()

function baseUrl() {
  // 允许单测场景覆盖
  return (app && app.globalData && app.globalData.API_BASE) || "https://api.your-domain.com/api"
}

function request(path, { method = "GET", data = {}, header = {} } = {}) {
  const token = wx.getStorageSync("token")
  const url = baseUrl() + path
  
  // 调试信息
  console.log('请求URL:', url)
  console.log('请求方法:', method)
  console.log('请求数据:', data)
  
  return new Promise((resolve, reject) => {
    wx.request({
      url: url,
      method, data,
      header: { "Authorization": token ? `Bearer ${token}` : "", ...header },
      timeout: 20000,
      success: ({ statusCode, data }) => {
        console.log('响应状态码:', statusCode)
        console.log('响应数据:', data)
        return (statusCode >= 200 && statusCode < 300) ? resolve(data) : reject(data)
      },
      fail: (error) => {
        console.error('请求失败:', error)
        reject(error)
      }
    })
  })
}

function upload(path, filePath, name = "file", formData = {}) {
  const token = wx.getStorageSync("token")
  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url: baseUrl() + path,
      filePath, name, formData,
      header: { "Authorization": token ? `Bearer ${token}` : "" },
      success: (res) => {
        try { resolve(JSON.parse(res.data)) } catch { resolve(res.data) }
      },
      fail: reject
    })
  })
}

module.exports = { request, upload }
