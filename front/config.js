// 配置文件
const config = {
  // 开发环境配置
  development: {
    apiBaseUrl: 'http://192.168.150.117:5000'
  },
  // 生产环境配置
  production: {
    apiBaseUrl: 'https://your-production-api.com'  // 替换为实际的生产环境API地址
  }
};

// 获取当前环境
const env = 'development';  // 可以根据实际情况切换环境

// 导出当前环境的配置
export const { apiBaseUrl } = config[env];

// 导出API请求封装
export const request = (options) => {
  const { url, method = 'GET', data, hideError = false } = options;
  
  return new Promise((resolve, reject) => {
    console.log('发起请求:', {
      url: `${apiBaseUrl}${url}`,
      method,
      data
    });

    wx.request({
      url: `${apiBaseUrl}${url}`,
      method,
      data,
      timeout: 30000,
      enableHttp2: true,
      enableQuic: true,
      success: (res) => {
        console.log('请求响应:', res);
        // 详细记录响应状态
        console.log('响应状态码:', res.statusCode);
        console.log('响应数据:', res.data);
        
        // 检查响应数据格式
        if (res.statusCode === 200) {
          if (res.data && (res.data.ok || Array.isArray(res.data))) {
            // 如果是数组直接返回，否则返回整个响应数据
            resolve(Array.isArray(res.data) ? { reminders: res.data } : res.data);
          } else if (res.data && res.data.error) {
            reject(new Error(res.data.error));
          } else {
            const error = new Error('无效的响应数据格式');
            error.response = res;
            error.statusCode = res.statusCode;
            error.rawData = res.data;
            console.error('响应数据格式错误:', {
              statusCode: res.statusCode,
              data: res.data
            });
            reject(error);
          }
        } else {
          const error = new Error(res.data.error || `请求失败 [${res.statusCode}]`);
          error.response = res;
          error.statusCode = res.statusCode;
          error.rawData = res.data;
          if (res.data.debug_info) {
            error.debug_info = res.data.debug_info;
          }
          console.error('请求错误详情:', {
            statusCode: res.statusCode,
            error: error.message,
            data: res.data
          });
          reject(error);
        }
      },
      fail: (err) => {
        console.error('请求失败:', err);
        // 网络错误特殊处理
        if (err.errMsg.includes('request:fail')) {
          err.message = '网络连接失败，请检查网络设置';
        }
        reject(err);
      },
      complete: () => {
        // 可以在这里处理加载状态
      }
    });
  }).catch(error => {
    console.error('请求错误:', error);
    if (!hideError) {
      let errorMessage = error.message || '请求失败';
      if (error.statusCode === 404) {
        errorMessage = '找不到相关数据';
      } else if (error.statusCode === 500) {
        errorMessage = '服务器内部错误';
      }
      
      if (error.debug_info && apiBaseUrl.includes('development')) {
        errorMessage += '\n' + error.debug_info;
      }

      wx.showToast({
        title: errorMessage,
        icon: 'none',
        duration: 3000
      });
    }
    throw error;
  });
};
