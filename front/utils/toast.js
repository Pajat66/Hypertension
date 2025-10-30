function tip(title = "操作成功") {
  wx.showToast({ title, icon: "none", duration: 1500 })
}
function loading(title = "请稍候") {
  wx.showLoading({ title, mask: true })
}
function hide() { try { wx.hideLoading() } catch(_) {} }
module.exports = { tip, loading, hide }
