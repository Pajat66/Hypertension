// 我的用药页面
const app = getApp()
Page({
  data: {
    time: '',
    network: '5G',
    medications: [],
    innerAudioContext: null,
    lastTapTime: 0,
    lastTapId: ''
  },

  onLoad() {
    // 设置当前时间
    this.updateTime();
    // 创建音频上下文
    this.setData({ innerAudioContext: wx.createInnerAudioContext() })
  },

  onShow() {
    // 页面显示时更新时间
    this.updateTime();
    // 拉取后端用药
    this.loadMedications();
    // 恢复今日服用状态
    this.restoreTodayTaken();
  },

  updateTime() {
    const now = new Date();
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    this.setData({ time: `${hours}:${minutes}` });
  },

  // 切换药品服用状态（处理单击和双击）
  toggleMedicationStatus(e) {
    const id = e.currentTarget.dataset.id;
    const currentTime = new Date().getTime();
    const lastTapTime = this.data.lastTapTime;
    const lastTapId = this.data.lastTapId;
    
    // 更新最后点击时间和ID
    this.setData({ lastTapTime: currentTime, lastTapId: id });
    
    // 判断是否为双击：同一元素，并且两次点击时间间隔小于300毫秒
    if (currentTime - lastTapTime < 300 && id === lastTapId) {
      // 双击事件处理 - 先待定，目前只显示提示
      this.handleDoubleTap(id);
    } else {
      // 单击事件处理 - 延迟执行，防止与双击冲突
      setTimeout(() => {
        if (this.data.lastTapId === id && this.data.lastTapTime === currentTime) {
          // 执行单击操作：切换药品服用状态
          const medications = this.data.medications.map(med => {
            if (med.id === id) {
              return { ...med, isTaken: !med.isTaken };
            }
            return med;
          });
          this.setData({ medications });
          // 如标记为已服用，提示并持久化当日状态
          const marked = medications.find(m => m.id === id)
          if (marked && marked.isTaken) {
            wx.showToast({ title: '已标记今日已服用', icon: 'success' })
            this.persistTodayTaken(id)
          }
        }
      }, 300);
    }
  },
  
  // 双击：TTS播报“药名 + 用法”
  handleDoubleTap(id) {
    const med = this.data.medications.find(m => m.id === id)
    if (!med) return
    const text = `${med.name}${med.time}服用`
    const apiBase = app.globalData.API_BASE
    wx.request({
      url: `${apiBase}/api/speak`,
      method: 'POST',
      header: { 'Content-Type': 'application/json' },
      data: { text },
      success: (res) => {
        if (res.data && res.data.audio_url) {
          const url = `${apiBase}${res.data.audio_url}`
          if (this.data.innerAudioContext) {
            this.data.innerAudioContext.src = url
            this.data.innerAudioContext.play()
          }
        } else {
          wx.showToast({ title: '语音生成失败', icon: 'none' })
        }
      },
      fail: () => wx.showToast({ title: '网络错误', icon: 'none' })
    })
  },

  // 将某药今日服用状态持久化（本地存储）
  persistTodayTaken(id) {
    const key = 'takenStatus'
    const today = new Date()
    const y = today.getFullYear()
    const m = String(today.getMonth() + 1).padStart(2, '0')
    const d = String(today.getDate()).padStart(2, '0')
    const todayStr = `${y}-${m}-${d}`
    let map = wx.getStorageSync(key) || {}
    map[id] = todayStr
    wx.setStorageSync(key, map)
  },

  // 恢复当日已服用状态（跨次进入页面仍显示）
  restoreTodayTaken() {
    const key = 'takenStatus'
    const map = wx.getStorageSync(key) || {}
    const today = new Date()
    const y = today.getFullYear()
    const m = String(today.getMonth() + 1).padStart(2, '0')
    const d = String(today.getDate()).padStart(2, '0')
    const todayStr = `${y}-${m}-${d}`
    const meds = (this.data.medications || []).map(m => ({
      ...m,
      isTaken: map[m.id] === todayStr
    }))
    this.setData({ medications: meds })
  },

  // 从后端加载患者用药
  loadMedications() {
    let patientId = wx.getStorageSync('userId')
    if (!patientId) {
      const userInfo = wx.getStorageSync('userInfo')
      if (userInfo && userInfo.user_id) patientId = userInfo.user_id
    }
    if (!patientId) return

    const apiBase = app.globalData.API_BASE
    wx.request({
      url: `${apiBase}/api/patients/${patientId}/medicines`,
      method: 'GET',
      success: (res) => {
        if (Array.isArray(res.data)) {
          // 将后端字段映射为前端展示结构
          const meds = res.data.map((m, idx) => ({
            id: String(m.med_id || idx),
            name: m.drug_name || '',
            time: m.frequency || '',
            dosage: m.dose || '',
            isTaken: false
          }))
          this.setData({ medications: meds })
        }
      }
    })
  },

  // 返回按钮点击事件
  onBack() {
    wx.navigateBack();
  }
});