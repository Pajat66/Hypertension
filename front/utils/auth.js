// Simple logout utility for miniapp
function clearAuth() {
  try {
    wx.removeStorageSync('token')
    wx.removeStorageSync('userInfo')
    wx.removeStorageSync('userType')
    wx.removeStorageSync('doctorId')
    wx.removeStorageSync('userId')
  } catch (e) {
    // ignore
  }
}

function logout({ loginPath }) {
  clearAuth()
  try {
    wx.reLaunch({ url: loginPath })
  } catch (e) {
    // fallback to redirectTo if reLaunch is not available in context
    try { wx.redirectTo({ url: loginPath }) } catch (_) {}
  }
}

module.exports = { logout }

