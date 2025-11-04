const { logout } = require('../../utils/auth')
const app = getApp()

Page({
  data: {
    displayName: '',
    patientCount: 0, // 管辖患者数
    todayNoBpCount: 0 // 今日未录血压数
  },

  onShow() {
    try {
      const user = wx.getStorageSync('userInfo') || {}
      const name = user.name || user.username || user.realname || user.nick || user.phone || ''
      this.setData({ displayName: name })
    } catch (_) {
      this.setData({ displayName: '' })
    }
    
    // 加载患者统计数据
    this.loadPatientStats()
  },

  // 加载患者统计数据
  loadPatientStats() {
    // 获取医生ID
    let doctorId = wx.getStorageSync('doctorId')
    if (!doctorId) {
      const userInfo = wx.getStorageSync('userInfo')
      if (userInfo && userInfo.worker_id) {
        doctorId = userInfo.worker_id
        wx.setStorageSync('doctorId', doctorId)
      }
    }

    if (!doctorId) {
      console.warn('未找到医生ID')
      return
    }

    const apiBase = app.globalData.API_BASE
    wx.request({
      url: `${apiBase}/doctors/${doctorId}/patients`,
      header: {
        'Content-Type': 'application/json'
      },
      method: 'GET',
      success: (res) => {
        if (res.data.ok && res.data.patients) {
          const patients = res.data.patients
          const patientCount = patients.length
          
          // 计算今日未录血压数
          this.calculateTodayNoBpCount(patients, patientCount)
          
          // 更新管辖患者数
          this.setData({ patientCount })
        } else {
          console.error('获取患者列表失败:', res.data)
        }
      },
      fail: (err) => {
        console.error('加载患者统计数据失败：', err)
      }
    })
  },

  // 计算今日未录血压数
  calculateTodayNoBpCount(patients, patientCount) {
    if (!patients || patients.length === 0) {
      this.setData({ todayNoBpCount: 0 })
      return
    }

    const apiBase = app.globalData.API_BASE
    // 获取今天的本地日期字符串 (YYYY-MM-DD)
    const today = new Date()
    const year = today.getFullYear()
    const month = String(today.getMonth() + 1).padStart(2, '0')
    const day = String(today.getDate()).padStart(2, '0')
    const todayStr = `${year}-${month}-${day}`

    let checkedCount = 0
    let noBpCount = 0

    patients.forEach((patient) => {
      wx.request({
        url: `${apiBase}/api/patients/${patient.user_id}/bp_records`,
        method: 'GET',
        success: (res) => {
          checkedCount++
          
          let hasTodayBp = false
          if (Array.isArray(res.data) && res.data.length > 0) {
            // 检查是否有今天的血压记录
            const latestRecord = res.data[0] // 已经按时间倒序排列
            if (latestRecord && latestRecord.measured_at) {
              // 提取日期部分进行比较
              const recordDate = latestRecord.measured_at.split('T')[0]
              if (recordDate === todayStr) {
                hasTodayBp = true
              }
            }
          }
          
          if (!hasTodayBp) {
            noBpCount++
          }

          // 所有患者都检查完毕
          if (checkedCount === patientCount) {
            this.setData({ todayNoBpCount: noBpCount })
          }
        },
        fail: () => {
          checkedCount++
          // 如果请求失败，也算作未录血压
          noBpCount++
          
          if (checkedCount === patientCount) {
            this.setData({ todayNoBpCount: noBpCount })
          }
        }
      })
    })
  },

  // 点击"患者管理"跳转到 management 页面
  gotoPatientManage() {
    wx.navigateTo({ url: '/pages/management/index' })
  },

  // 点击"患者消息"跳转到 message 页面
  gotoPatientMessage() {
    wx.navigateTo({ url: '/pages/message/index' })
  },

  // 点击"批量提醒"跳转到 reminder 页面
  gotoBatchRemind() {
    wx.navigateTo({ url: '/pages/reminder/index' })
  },

  // 退出登录（医生）
  handleLogoutTap() {
    wx.showModal({
      title: '确认退出',
      content: '退出后需要重新登录',
      confirmText: '退出',
      confirmColor: '#ff6b6b',
      success(res) {
        if (res.confirm) {
          logout({ loginPath: '/pages/login/login' })
        }
      }
    })
  }
})
