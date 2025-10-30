const app = getApp()
const { request } = require('../../utils/request')

Page({
  data: {
    currentPatient: {}, // 当前聊天的患者信息（从列表页传递过来）
    messageList: [], // 聊天消息列表
    replyContent: "", // 输入的回复内容
    scrollTop: 0, // 滚动位置（用于自动滚到底部）
    patientId: null, // 患者ID
    doctorId: null // 医生ID
  },

  onLoad(options) {
    // 获取医生ID（从存储中读取）
    const doctorId = wx.getStorageSync('doctorId') || options.doctorId
    this.setData({ doctorId })
    
    // 接收从患者消息列表页传递的患者信息
    const patientInfo = JSON.parse(decodeURIComponent(options.patient))
    this.setData({
      currentPatient: patientInfo,
      patientId: patientInfo.user_id
    })

    // 获取该患者的历史聊天记录
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
          sender_type: 'doctor' // 医生标记患者发送的消息为已读
        }
      })
      console.log('消息已标记为已读')
    } catch (error) {
      console.error('标记已读失败：', error)
    }
  },

  // 监听输入框内容
  onInput(e) {
    this.setData({
      replyContent: e.detail.value
    });
  },

  // 发送消息
  async sendMessage() {
    const { replyContent, patientId, doctorId } = this.data
    if (!replyContent.trim()) {
      wx.showToast({ title: "请输入内容", icon: "none" })
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
          sender_type: 'doctor',
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
    // 获取消息列表高度，计算滚动位置
    const query = wx.createSelectorQuery();
    query.select('.message-list').boundingClientRect(rect => {
      this.setData({
        scrollTop: rect.height
      });
    }).exec();
  },

  // 获取当前时间（格式化：HH:MM）
  getNowTime() {
    const date = new Date();
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  },

  // 返回上一页（患者消息列表）
  goBack() {
    wx.navigateBack();
  }
});