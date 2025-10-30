const app = getApp()
const { request } = require('../../utils/request')

Page({
  data: {
    currentDoctor: {}, // 当前聊天的医生信息（从医生列表页传递）
    messageList: [], // 聊天记录
    replyContent: "", // 输入的提问内容
    scrollTop: 0, // 滚动位置
    patientId: null, // 患者ID
    doctorId: null // 医生ID
  },

  onLoad(options) {
    // 获取患者ID
    const patientId = wx.getStorageSync('userId') || options.patientId
    this.setData({ patientId })
    
    // 接收从医生列表页传递的医生信息
    const doctorInfo = JSON.parse(decodeURIComponent(options.doctor))
    this.setData({
      currentDoctor: doctorInfo,
      doctorId: doctorInfo.worker_id
    })

    // 获取与该医生的历史聊天记录
    this.getHistoryMessages()
    
    // 开启自动刷新消息
    this.startMessagePolling()
  },
  
  onUnload() {
    // 页面卸载时清除轮询
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer)
    }
    // 标记消息为已读
    this.markAsRead()
  },
  
  // 开启消息轮询（每3秒刷新一次）
  startMessagePolling() {
    this.pollingTimer = setInterval(() => {
      this.getHistoryMessages()
    }, 3000)
  },

  // 获取历史消息
  async getHistoryMessages() {
    const { patientId, doctorId } = this.data
    if (!patientId || !doctorId) return
    
    try {
      const result = await request('/chat/messages', {
        method: 'GET',
        data: {
          patient_id: patientId,
          doctor_id: doctorId
        }
      })
      
      if (result.ok && result.messages) {
        const messages = result.messages.map(msg => ({
          type: msg.sender_type, // 'patient' 或 'doctor'
          content: msg.content,
          time: this.formatTime(msg.created_at)
        }))
        
        this.setData({
          messageList: messages
        }, () => {
          this.scrollToBottom()
        })
      }
    } catch (error) {
      console.error('获取消息失败：', error)
    }
  },
  
  // 格式化时间
  formatTime(timestamp) {
    if (!timestamp) return ''
    const date = new Date(timestamp)
    const hours = date.getHours().toString().padStart(2, '0')
    const minutes = date.getMinutes().toString().padStart(2, '0')
    return `${hours}:${minutes}`
  },
  
  // 标记消息为已读
  async markAsRead() {
    const { patientId, doctorId } = this.data
    if (!patientId || !doctorId) return
    
    try {
      await request('/chat/mark_read', {
        method: 'POST',
        data: {
          patient_id: patientId,
          doctor_id: doctorId,
          sender_type: 'patient' // 患者标记医生发送的消息为已读
        }
      })
      console.log('消息已标记为已读')
    } catch (error) {
      console.error('标记已读失败：', error)
    }
  },

  // 监听输入框
  onInput(e) {
    this.setData({
      replyContent: e.detail.value
    });
  },

  // 发送消息（患者提问）
  async sendMessage() {
    const { replyContent, patientId, doctorId } = this.data
    if (!replyContent.trim()) {
      wx.showToast({ title: "请输入问题", icon: "none" })
      return
    }

    const content = replyContent.trim()
    
    // 先清空输入框，提供即时反馈
    this.setData({
      replyContent: ""
    })

    try {
      const result = await request('/chat/send', {
        method: 'POST',
        data: {
          patient_id: patientId,
          doctor_id: doctorId,
          sender_type: 'patient',
          content: content
        }
      })

      if (result.ok) {
        // 刷新消息列表
        this.getHistoryMessages()
      } else {
        wx.showToast({ title: '发送失败', icon: 'none' })
        // 恢复输入框内容
        this.setData({ replyContent: content })
      }
    } catch (err) {
      console.error('发送消息失败：', err)
      wx.showToast({ title: '网络错误，请重试', icon: 'none' })
      // 恢复输入框内容
      this.setData({ replyContent: content })
    }
  },

  // 自动滚动到最新消息
  scrollToBottom() {
    const query = wx.createSelectorQuery();
    query.select('.message-list').boundingClientRect(rect => {
      this.setData({
        scrollTop: rect.height
      });
    }).exec();
  },

  // 获取当前时间
  getNowTime() {
    const date = new Date();
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  },

  // 返回医生列表页
  goBack() {
    wx.navigateBack();
  }
});