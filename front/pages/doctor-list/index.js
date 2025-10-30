const app = getApp()

Page({
  data: {
    doctorList: [], // 医生列表
    patientId: null, // 患者ID
    loading: false
  },

  onLoad() {
    // 获取患者ID（尝试多种方式）
    let patientId = wx.getStorageSync('userId')
    
    // 如果直接获取不到，从 userInfo 中获取
    if (!patientId) {
      const userInfo = wx.getStorageSync('userInfo')
      if (userInfo && userInfo.user_id) {
        patientId = userInfo.user_id
      }
    }
    
    if (!patientId) {
      wx.showToast({ title: '请先登录', icon: 'none' })
      setTimeout(() => {
        wx.navigateBack()
      }, 1500)
      return
    }

    this.setData({ patientId })
    this.loadDoctorList()
  },

  // 加载医生列表
  loadDoctorList() {
    const { patientId } = this.data
    if (!patientId) return

    this.setData({ loading: true })
    const apiBase = app.globalData.API_BASE

    wx.request({
      url: `${apiBase}/patients/${patientId}/doctors`,
      method: 'GET',
      success: (res) => {
        this.setData({ loading: false })
        
        if (res.data.ok && res.data.doctors) {
          // 为每个医生加载最后一条消息和未读数量
          this.loadLastMessagesAndUnreadCount(res.data.doctors)
        } else {
          wx.showToast({ title: '获取医生列表失败', icon: 'none' })
        }
      },
      fail: (err) => {
        this.setData({ loading: false })
        console.error('加载医生列表失败：', err)
        wx.showToast({ title: '网络错误', icon: 'none' })
      }
    })
  },

  // 加载最后一条消息和未读数量
  loadLastMessagesAndUnreadCount(doctors) {
    const { patientId } = this.data
    const apiBase = app.globalData.API_BASE
    let completedCount = 0
    const total = doctors.length

    doctors.forEach((doctor, index) => {
      // 加载最后一条消息
      wx.request({
        url: `${apiBase}/chat/last_message/${patientId}/${doctor.worker_id}`,
        success: (res) => {
          if (res.data.ok && res.data.message) {
            doctors[index].lastMessage = res.data.message.content
            doctors[index].lastMessageTime = this.formatTime(res.data.message.created_at)
          } else {
            doctors[index].lastMessage = '暂无消息'
            doctors[index].lastMessageTime = ''
          }
          completedCount++
          if (completedCount === total) {
            this.setData({ doctorList: doctors })
          }
        }
      })

      // 加载未读消息数
      wx.request({
        url: `${apiBase}/chat/unread_count`,
        data: {
          patient_id: patientId,
          doctor_id: doctor.worker_id,
          sender_type: 'patient' // 患者查看医生发送的未读消息
        },
        success: (res) => {
          if (res.data.ok) {
            doctors[index].unreadCount = res.data.unread_count || 0
          }
        }
      })
    })
  },

  // 格式化时间
  formatTime(timestamp) {
    if (!timestamp) return ''
    const date = new Date(timestamp)
    const now = new Date()
    const diff = now - date

    // 如果是今天的消息，显示时间
    if (diff < 24 * 60 * 60 * 1000) {
      const hours = date.getHours().toString().padStart(2, '0')
      const minutes = date.getMinutes().toString().padStart(2, '0')
      return `${hours}:${minutes}`
    }
    
    // 如果是昨天的消息
    if (diff < 48 * 60 * 60 * 1000) {
      return '昨天'
    }
    
    // 更早的消息显示日期
    const month = (date.getMonth() + 1).toString().padStart(2, '0')
    const day = date.getDate().toString().padStart(2, '0')
    return `${month}-${day}`
  },

  // 跳转到聊天页面
  gotoChat(e) {
    const doctor = e.currentTarget.dataset.doctor
    if (!doctor) return

    wx.navigateTo({
      url: `/pages/pt-chat/index?doctor=${encodeURIComponent(JSON.stringify(doctor))}`
    })
  },

  // 返回
  goBack() {
    wx.navigateBack()
  },

  // 下拉刷新
  onPullDownRefresh() {
    this.loadDoctorList()
    setTimeout(() => {
      wx.stopPullDownRefresh()
    }, 1000)
  }
})

