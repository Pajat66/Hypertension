const app = getApp()

function baseUrl() {
  // 允许单测场景覆盖
  return (app && app.globalData && app.globalData.API_BASE) || "http://192.168.150.117:5000"
}

function request(path, { method = "GET", data = {}, header = {} } = {}) {
  const token = wx.getStorageSync("token")
  const url = baseUrl() + path
  
  // 确保请求头中包含 Content-Type
  const defaultHeader = {
    'Content-Type': 'application/json'
  }
  
  // 调试信息
  console.log('请求URL:', url)
  console.log('请求方法:', method)
  console.log('请求数据:', data)
  console.log('请求头:', { ...defaultHeader, ...header })
  
  return new Promise((resolve, reject) => {
    console.log('========== 发起请求 ==========');
    console.log('URL:', url);
    console.log('Method:', method);
    console.log('Headers:', {
      "Authorization": token ? `Bearer ${token}` : "",
      ...defaultHeader,
      ...header
    });
    console.log('Data:', data);
    console.log('============================');

    wx.request({
      url: url,
      method, data,
      header: { 
        "Authorization": token ? `Bearer ${token}` : "", 
        ...defaultHeader,
        ...header 
      },
      timeout: 20000,
      success: ({ statusCode, data }) => {
        console.log('========== 响应数据 ==========');
        console.log('状态码:', statusCode);
        console.log('数据:', data);
        console.log('============================');
        
        if (statusCode >= 200 && statusCode < 300) {
          resolve(data);
        } else {
          console.error('请求失败:', { statusCode, data });
          reject(data);
        }
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
