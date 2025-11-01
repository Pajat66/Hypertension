const app = getApp()

Page({
  data: {
    patientList: [], // 患者列表
    doctorId: null, // 医生ID
    loading: false
  },

  onLoad() {
    // 获取医生ID（尝试多种方式）
    let doctorId = wx.getStorageSync('doctorId')
    
    // 如果直接获取不到，从 userInfo 中获取
    if (!doctorId) {
      const userInfo = wx.getStorageSync('userInfo')
      console.log('获取到的医生信息:', userInfo);
      if (userInfo && userInfo.worker_id) {
        doctorId = userInfo.worker_id;
        // 保存医生ID以便后续使用
        wx.setStorageSync('doctorId', doctorId);
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

  // 加载患者列表
  loadPatientList() {
    const { doctorId } = this.data
    if (!doctorId) return

    this.setData({ loading: true })
    const apiBase = app.globalData.API_BASE

    console.log('正在获取患者列表，医生ID:', doctorId);
    wx.request({
      url: `${apiBase}/doctors/${doctorId}/patients`,
      header: {
        'Content-Type': 'application/json'
      },
      method: 'GET',
      success: (res) => {
        this.setData({ loading: false })
        
        if (res.data.ok && res.data.patients) {
          // 为每个患者加载最后一条消息和未读数量
          this.loadLastMessagesAndUnreadCount(res.data.patients)
        } else {
          wx.showToast({ title: '获取患者列表失败', icon: 'none' })
        }
      },
      fail: (err) => {
        this.setData({ loading: false })
        console.error('加载患者列表失败：', err)
        wx.showToast({ title: '网络错误', icon: 'none' })
      }
    })
  },

  // 加载最后一条消息和未读数量
  loadLastMessagesAndUnreadCount(patients) {
    const { doctorId } = this.data
    const apiBase = app.globalData.API_BASE
    let completedCount = 0
    const total = patients.length

    patients.forEach((patient, index) => {
      // 加载最后一条消息
      wx.request({
        url: `${apiBase}/chat/last_message/${patient.user_id}/${doctorId}`,
        success: (res) => {
          if (res.data.ok && res.data.message) {
            patients[index].lastMessage = res.data.message.content
            patients[index].lastMessageTime = this.formatTime(res.data.message.created_at)
          } else {
            patients[index].lastMessage = '暂无消息'
            patients[index].lastMessageTime = ''
          }
          completedCount++
          if (completedCount === total) {
            // 按照最后消息时间排序
            patients.sort((a, b) => {
              if (!a.lastMessageTime) return 1
              if (!b.lastMessageTime) return -1
              return new Date(b.lastMessageTime) - new Date(a.lastMessageTime)
            })
            this.setData({ patientList: patients })
          }
        }
      })

      // 加载未读消息数
      wx.request({
        url: `${apiBase}/chat/unread_count`,
        data: {
          patient_id: patient.user_id,
          doctor_id: doctorId,
          sender_type: 'doctor' // 医生查看患者发送的未读消息
        },
        success: (res) => {
          if (res.data.ok) {
            patients[index].unreadCount = res.data.unread_count || 0
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

  goBack() {
    wx.navigateBack()
  },

  // 跳转到聊天页面
  gotoChat(e) {
    const patient = e.currentTarget.dataset.patient
    if (!patient) return

    wx.navigateTo({
      url: `/pages/chat/index?patient=${encodeURIComponent(JSON.stringify(patient))}`
    })
  },

  // 下拉刷新
  onPullDownRefresh() {
    this.loadPatientList()
    setTimeout(() => {
      wx.stopPullDownRefresh()
    }, 1000)
  }
})