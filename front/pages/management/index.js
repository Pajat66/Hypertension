const app = getApp()

Page({
  data: {
    patientList: [], // 患者列表
    loading: false,
    doctorId: null
  },

  onLoad() {
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
      wx.showToast({ title: '请先登录', icon: 'none' })
      setTimeout(() => {
        wx.navigateBack()
      }, 1500)
      return
    }

    this.setData({ doctorId })
    this.loadPatientList()
  },

  onShow() {
    // 页面显示时重新加载患者列表（可能数据有更新）
    if (this.data.doctorId) {
      this.loadPatientList()
    }
  },

  // 加载患者列表
  loadPatientList() {
    const { doctorId } = this.data
    if (!doctorId) return

    this.setData({ loading: true })
    const apiBase = app.globalData.API_BASE

    wx.request({
      url: `${apiBase}/doctors/${doctorId}/patients`,
      header: {
        'Content-Type': 'application/json'
      },
      method: 'GET',
      success: (res) => {
        this.setData({ loading: false })
        
        if (res.data.ok && res.data.patients) {
          // 为每个患者加载最新血压记录
          this.loadLatestBpForPatients(res.data.patients)
        } else {
          wx.showToast({ title: '获取患者列表失败', icon: 'none' })
          this.setData({ patientList: [] })
        }
      },
      fail: (err) => {
        this.setData({ loading: false })
        console.error('加载患者列表失败：', err)
        wx.showToast({ title: '网络错误', icon: 'none' })
        this.setData({ patientList: [] })
      }
    })
  },

  // 为每个患者加载最新血压记录
  loadLatestBpForPatients(patients) {
    if (!patients || patients.length === 0) {
      this.setData({ patientList: [] })
      return
    }

    const apiBase = app.globalData.API_BASE
    const patientList = patients.map(p => ({
      ...p,
      latestBp: null, // 最新血压
      bpStatus: 'none' // 'normal', 'warning', 'danger', 'none'
    }))

    this.setData({ patientList })

    // 为每个患者获取最新血压
    patients.forEach((patient, index) => {
      wx.request({
        url: `${apiBase}/api/patients/${patient.user_id}/bp_records`,
        method: 'GET',
        success: (res) => {
          let latestBp = null
          let bpStatus = 'none'

          if (Array.isArray(res.data) && res.data.length > 0) {
            const latestRecord = res.data[0] // 已经按时间倒序排列
            if (latestRecord && latestRecord.systolic && latestRecord.diastolic) {
              latestBp = {
                systolic: latestRecord.systolic,
                diastolic: latestRecord.diastolic,
                measured_at: latestRecord.measured_at
              }

              // 判断血压状态
              if (latestRecord.systolic >= 180 || latestRecord.diastolic >= 120) {
                bpStatus = 'danger' // 危险（红色）
              } else if (latestRecord.systolic >= 140 || latestRecord.diastolic >= 90) {
                bpStatus = 'warning' // 警告（橙色）
              } else {
                bpStatus = 'normal' // 正常
              }
            }
          }

          // 更新对应患者的数据
          const updatedList = [...this.data.patientList]
          updatedList[index] = {
            ...updatedList[index],
            latestBp,
            bpStatus
          }
          this.setData({ patientList: updatedList })
        },
        fail: () => {
          // 获取失败，保持默认值
          console.error(`获取患者 ${patient.name} 的血压记录失败`)
        }
      })
    })
  },

  goBack() {
    wx.navigateBack()
  },

  // 跳转到患者详情（血压历史页面）
  gotoPatientDetail(e) {
    const patient = e.currentTarget.dataset.patient
    if (patient) {
      wx.navigateTo({
        url: `/pages/blood/index?patientId=${patient.user_id}&patientName=${encodeURIComponent(patient.name || '')}`
      })
    }
  },

  playPatientMessage(e) {
    e.stopPropagation() // 阻止事件冒泡
    wx.showToast({
      title: '播放患者消息',
      icon: 'none'
    })
  },

  // 患者消息按钮点击事件
  gotoPatientMessage() {
    wx.navigateTo({
      url: '/pages/message/index'
    })
  }
})